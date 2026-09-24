import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { CandidateProfileSchema } from "../schemas/index.js";
import type { ScoreStandard } from "../schemas/score-standard.js";
import { parseResume } from "../pipeline/parse-resume.js";
import { parseEvidenceInput, scoreResumeWithLlm } from "../scoring/llm-jd-scorer.js";
import { archiveResumeFile } from "../mail/resume-archive.js";

export type ScoreFileStatus = "queued" | "parsing" | "scoring" | "completed" | "failed";
export type ScoreProcessStatus = "queued" | "processing" | "paused" | "completed" | "partial_failed" | "failed";

export type ScoreProcessFile = {
  id: string;
  fileName: string;
  storedFileName: string;
  status: ScoreFileStatus;
  score?: number;
  candidateId?: string;
  outputDirectory?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  archiveStatus?: "saved" | "disabled" | "failed";
  archivePath?: string;
  archiveError?: string;
};

export type ScoreProcess = {
  id: string;
  jobId: string;
  scoreStandardId: string;
  scoreStandardVersion: number;
  status: ScoreProcessStatus;
  pauseRequested?: boolean;
  files: ScoreProcessFile[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

type UploadedFile = { name: string; data: string };
const extensionPattern = /\.(pdf|docx|txt)$/i;
const processWrites = new Map<string, Promise<void>>();

export async function createScoreProcess(jobId: string, jobTitle: string, standard: ScoreStandard, uploads: UploadedFile[], source: "upload" | "email" = "upload"): Promise<ScoreProcess> {
  assertSafeJobId(jobId);
  const preparedFiles = uploads.map((upload) => {
    const match = upload.name.match(extensionPattern);
    if (!match) throw new Error(`${upload.name}：仅支持 PDF、DOCX、TXT 文件。`);
    const buffer = Buffer.from(upload.data, "base64");
    if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) throw new Error(`${upload.name}：文件为空或超过 20 MB。`);
    return { upload, buffer, extension: match[1].toLowerCase() };
  });
  const id = randomUUID();
  const directory = processDirectory(jobId, id);
  await mkdir(path.join(directory, "inputs"), { recursive: true });
  const files: ScoreProcessFile[] = [];
  for (const [index, prepared] of preparedFiles.entries()) {
    const originalName = path.basename(prepared.upload.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 150);
    const storedFileName = `${String(index + 1).padStart(3, "0")}-${originalName}`;
    await writeFile(path.join(directory, "inputs", storedFileName), prepared.buffer, { flag: "wx" });
    const { upload } = prepared;
    const archive = await archiveResumeFile({
      sourcePath: path.join(directory, "inputs", storedFileName),
      originalName: path.basename(upload.name),
      jobTitle,
      source,
    }).catch((error: unknown) => ({ status: "failed" as const, path: undefined, error: error instanceof Error ? error.message : String(error) }));
    files.push({
      id: randomUUID(), fileName: path.basename(upload.name), storedFileName, status: "queued",
      archiveStatus: archive.status,
      archivePath: archive.path,
      archiveError: archive.error,
    });
  }
  const now = new Date().toISOString();
  const process: ScoreProcess = {
    id,
    jobId,
    scoreStandardId: standard.id,
    scoreStandardVersion: standard.version,
    status: "queued",
    files,
    createdAt: now,
    updatedAt: now,
  };
  await writeProcess(process);
  return process;
}

export async function runScoreProcess(process: ScoreProcess, job: { id: string; jdText: string }, standard: ScoreStandard): Promise<void> {
  await updateProcess(process.jobId, process.id, (current) => ({
    ...current,
    status: "processing",
    startedAt: new Date().toISOString(),
  }));

  for (const [index] of process.files.entries()) {
    const current = await getScoreProcess(process.jobId, process.id);
    if (current.pauseRequested) {
      await updateProcess(process.jobId, process.id, (latest) => ({ ...latest, status: "paused", pauseRequested: false }));
      return;
    }
    const file = current.files[index];
    if (!file || file.status !== "queued") continue;
    try {
      await updateFile(process.jobId, process.id, index, { status: "parsing", startedAt: new Date().toISOString(), error: undefined });
      const sourcePath = path.join(processDirectory(process.jobId, process.id), "inputs", file.storedFileName);
      const outputDirectory = await parseResume({ filePath: sourcePath });
      const [reportText, evidenceText, profileText] = await Promise.all([
        readFile(path.join(outputDirectory, "parse-report.json"), "utf8"),
        readFile(path.join(outputDirectory, "evidence.json"), "utf8"),
        readFile(path.join(outputDirectory, "candidate-profile.json"), "utf8"),
      ]);
      const report = JSON.parse(reportText) as { candidateId?: string };
      const evidence = parseEvidenceInput(JSON.parse(evidenceText));
      const profile = CandidateProfileSchema.parse(JSON.parse(profileText));
      await updateFile(process.jobId, process.id, index, { status: "scoring", outputDirectory });
      const score = await scoreResumeWithLlm({
        candidateId: report.candidateId ?? profile.id,
        profile,
        evidence,
        jdText: job.jdText,
        jobId: job.id,
        scorecardId: standard.id,
        scoreStandard: standard,
        generatedAt: new Date().toISOString(),
      });
      await writeFile(path.join(outputDirectory, `llm-score-${job.id}.json`), `${JSON.stringify(score, null, 2)}\n`, "utf8");
      await updateFile(process.jobId, process.id, index, {
        status: "completed",
        outputDirectory,
        candidateId: score.candidateId,
        score: score.finalScore,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      await updateFile(process.jobId, process.id, index, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
    }
  }

  await updateProcess(process.jobId, process.id, (current) => {
    const completedCount = current.files.filter((file) => file.status === "completed").length;
    const failedCount = current.files.filter((file) => file.status === "failed").length;
    if (current.pauseRequested && current.files.some((file) => file.status === "queued")) {
      return { ...current, status: "paused", pauseRequested: false };
    }
    return {
      ...current,
      status: failedCount === 0 ? "completed" : completedCount > 0 ? "partial_failed" : "failed",
      pauseRequested: false,
      completedAt: new Date().toISOString(),
    };
  });
}

export async function getScoreProcess(jobId: string, processId: string): Promise<ScoreProcess> {
  return readProcess(jobId, processId);
}

export async function requestScoreProcessPause(jobId: string, processId: string): Promise<ScoreProcess> {
  return updateProcessAndReturn(jobId, processId, (current) => {
    if (current.status !== "queued" && current.status !== "processing") throw new Error("当前进程无法暂停。");
    return { ...current, pauseRequested: true };
  });
}

export async function queueScoreProcessResume(jobId: string, processId: string): Promise<ScoreProcess> {
  return updateProcessAndReturn(jobId, processId, (current) => {
    if (current.status !== "paused") throw new Error("只有已暂停的进程可以继续。");
    return { ...current, status: "queued", pauseRequested: false, completedAt: undefined };
  });
}

export async function queueFailedScoreFilesRetry(jobId: string, processId: string, fileIds: string[]): Promise<ScoreProcess> {
  if (fileIds.length === 0 || new Set(fileIds).size !== fileIds.length) throw new Error("请选择不同的失败简历后再重试。");
  return updateProcessAndReturn(jobId, processId, (current) => {
    if (current.status === "queued" || current.status === "processing" || current.status === "paused") {
      throw new Error("请等待当前评分批次结束后，再重新解析失败简历。");
    }
    const failedFileIds = new Set(current.files.filter((file) => file.status === "failed").map((file) => file.id));
    if (fileIds.some((fileId) => !failedFileIds.has(fileId))) throw new Error("所选简历中包含非失败项，请刷新后重试。");
    const retryFileIds = new Set(fileIds);
    return {
      ...current,
      status: "queued",
      pauseRequested: false,
      completedAt: undefined,
      files: current.files.map((file) => retryFileIds.has(file.id)
        ? { ...file, status: "queued", score: undefined, candidateId: undefined, outputDirectory: undefined, error: undefined, startedAt: undefined, completedAt: undefined }
        : file),
    };
  });
}

export async function listScoreProcesses(jobId: string): Promise<ScoreProcess[]> {
  assertSafeJobId(jobId);
  const directory = path.join(path.resolve("data/jobs"), jobId, "score-processes");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      return JSON.parse(await readFile(path.join(directory, entry.name, "process.json"), "utf8")) as ScoreProcess;
    } catch {
      return null;
    }
  }));
  return records.filter((entry): entry is ScoreProcess => entry !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function updateFile(jobId: string, processId: string, index: number, patch: Partial<ScoreProcessFile>): Promise<void> {
  await updateProcess(jobId, processId, (current) => ({
    ...current,
    files: current.files.map((file, fileIndex) => fileIndex === index ? { ...file, ...patch } : file),
  }));
}

async function updateProcess(jobId: string, processId: string, update: (current: ScoreProcess) => ScoreProcess): Promise<void> {
  await updateProcessAndReturn(jobId, processId, update);
}

async function updateProcessAndReturn(jobId: string, processId: string, update: (current: ScoreProcess) => ScoreProcess): Promise<ScoreProcess> {
  const key = `${jobId}:${processId}`;
  const previousWrite = processWrites.get(key) ?? Promise.resolve();
  let updated: ScoreProcess | undefined;
  const currentWrite = previousWrite.catch(() => undefined).then(async () => {
    const current = await readProcess(jobId, processId);
    updated = { ...update(current), updatedAt: new Date().toISOString() };
    await writeProcess(updated);
  });
  processWrites.set(key, currentWrite);
  try {
    await currentWrite;
    return updated as ScoreProcess;
  } finally {
    if (processWrites.get(key) === currentWrite) processWrites.delete(key);
  }
}

async function readProcess(jobId: string, processId: string): Promise<ScoreProcess> {
  assertSafeJobId(jobId);
  if (!/^[0-9a-f-]{36}$/i.test(processId)) throw new Error("评分进程编号无效。");
  return JSON.parse(await readFile(path.join(processDirectory(jobId, processId), "process.json"), "utf8")) as ScoreProcess;
}

async function writeProcess(process: ScoreProcess): Promise<void> {
  const directory = processDirectory(process.jobId, process.id);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `process-${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(process, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path.join(directory, "process.json"));
}

function processDirectory(jobId: string, processId: string): string {
  assertSafeJobId(jobId);
  if (!/^[0-9a-f-]{36}$/i.test(processId)) throw new Error("评分进程编号无效。");
  return path.join(path.resolve("data/jobs"), jobId, "score-processes", processId);
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(jobId)) throw new Error("岗位编号无效。");
}
