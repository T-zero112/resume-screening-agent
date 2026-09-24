import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { JobSchema, type Job } from "../schemas/job.js";
import { ScoreStandardSchema, type ScoreStandard } from "../schemas/score-standard.js";

const jobsDirectory = path.resolve("data/jobs");

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(jobId)) throw new Error("岗位编号无效。");
}

export async function createJobDraft(input: { title: string; jdText: string; standard: ScoreStandard }): Promise<Job> {
  assertSafeJobId(input.standard.jobId);
  const now = new Date().toISOString();
  const job = JobSchema.parse({
    schemaVersion: "job.v1",
    id: input.standard.jobId,
    title: input.title,
    jdText: input.jdText,
    source: "manual",
    status: "standard_generated",
    createdAt: now,
    updatedAt: now,
  });
  const directory = path.join(jobsDirectory, job.id);
  await mkdir(directory, { recursive: true });
  await writeJson(path.join(directory, "job.json"), job);
  await writeJson(path.join(directory, `score-standard.v${input.standard.version}.draft.json`), input.standard);
  return job;
}

export async function getLatestJobDraft(): Promise<{ job: Job; standard: ScoreStandard } | null> {
  let entries;
  try {
    entries = await readdir(jobsDirectory, { withFileTypes: true });
  } catch {
    return null;
  }
  const jobs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const job = JobSchema.parse(JSON.parse(await readFile(path.join(jobsDirectory, entry.name, "job.json"), "utf8")));
      return job.archivedAt ? null : job;
    } catch {
      return null;
    }
  }));
  const latestJob = jobs.filter((job): job is Job => job !== null).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!latestJob) return null;

  const directory = path.join(jobsDirectory, latestJob.id);
  const files = await readdir(directory);
  const candidates = files.flatMap((file) => {
    const match = file.match(/^score-standard\.v(\d+)(\.draft)?\.json$/);
    return match ? [{ file, version: Number(match[1]), draft: Boolean(match[2]) }] : [];
  }).sort((left, right) => right.version - left.version || Number(left.draft) - Number(right.draft));
  for (const candidate of candidates) {
    try {
      const standard = ScoreStandardSchema.parse(JSON.parse(await readFile(path.join(directory, candidate.file), "utf8")));
      return { job: latestJob, standard };
    } catch {
      continue;
    }
  }
  return null;
}

export async function getJobDraft(jobId: string): Promise<{ job: Job; standard: ScoreStandard }> {
  assertSafeJobId(jobId);
  const directory = path.join(jobsDirectory, jobId);
  const job = JobSchema.parse(JSON.parse(await readFile(path.join(directory, "job.json"), "utf8")));
  const files = await readdir(directory);
  const candidates = files.flatMap((file) => {
    const match = file.match(/^score-standard\.v(\d+)(\.draft)?\.json$/);
    return match ? [{ file, version: Number(match[1]), draft: Boolean(match[2]) }] : [];
  }).sort((left, right) => right.version - left.version || Number(left.draft) - Number(right.draft));
  for (const candidate of candidates) {
    try {
      const standard = ScoreStandardSchema.parse(JSON.parse(await readFile(path.join(directory, candidate.file), "utf8")));
      return { job, standard };
    } catch {
      continue;
    }
  }
  throw new Error("岗位 " + jobId + " 没有可用的评分标准。");
}

export async function listJobs(includeArchived = false): Promise<Array<{ job: Job; standard: ScoreStandard }>> {
  let entries;
  try {
    entries = await readdir(jobsDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  const jobs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return await getJobDraft(entry.name); } catch { return null; }
  }));
  return jobs.filter((item): item is { job: Job; standard: ScoreStandard } => item !== null && (includeArchived || !item.job.archivedAt))
    .sort((left, right) => right.job.updatedAt.localeCompare(left.job.updatedAt));
}

export async function archiveJob(jobId: string): Promise<Job> {
  assertSafeJobId(jobId);
  const file = path.join(jobsDirectory, jobId, "job.json");
  const job = JobSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (job.archivedAt) return job;
  const now = new Date().toISOString();
  const archived = JobSchema.parse({ ...job, archivedAt: now, updatedAt: now });
  await writeJson(file, archived);
  return archived;
}

export async function restoreJob(jobId: string): Promise<Job> {
  assertSafeJobId(jobId);
  const file = path.join(jobsDirectory, jobId, "job.json");
  const job = JobSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (!job.archivedAt) return job;
  const { archivedAt: _archivedAt, ...activeJob } = job;
  const restored = JobSchema.parse({ ...activeJob, updatedAt: new Date().toISOString() });
  await writeJson(file, restored);
  return restored;
}

export async function getConfirmedJobStandard(jobId: string): Promise<{ job: Job; standard: ScoreStandard }> {
  assertSafeJobId(jobId);
  const directory = path.join(jobsDirectory, jobId);
  const job = JobSchema.parse(JSON.parse(await readFile(path.join(directory, "job.json"), "utf8")));
  if (job.archivedAt) throw new Error(`岗位 ${jobId} 已移出岗位池，不能继续评分。`);
  const files = await readdir(directory);
  const standards = await Promise.all(files.filter((file) => /^score-standard\.v\d+\.json$/.test(file)).map(async (file) => {
    try {
      return ScoreStandardSchema.parse(JSON.parse(await readFile(path.join(directory, file), "utf8")));
    } catch {
      return null;
    }
  }));
  const standard = standards.filter((item): item is ScoreStandard => item !== null && item.status === "confirmed" && item.jobId === jobId)
    .sort((left, right) => right.version - left.version)[0];
  if (job.status !== "confirmed" || !standard) {
    throw new Error(`岗位 ${jobId} 没有已由 HR 确认的评分标准，请先在工作台确认。`);
  }
  return { job, standard };
}

export async function getConfirmedJobStandardVersion(jobId: string, version: number): Promise<{ job: Job; standard: ScoreStandard }> {
  assertSafeJobId(jobId);
  if (!Number.isInteger(version) || version < 1) throw new Error("评分标准版本无效。");
  const directory = path.join(jobsDirectory, jobId);
  const job = JobSchema.parse(JSON.parse(await readFile(path.join(directory, "job.json"), "utf8")));
  if (job.archivedAt) throw new Error(`岗位 ${jobId} 已移出岗位池，不能继续评分。`);
  const standard = ScoreStandardSchema.parse(JSON.parse(await readFile(path.join(directory, `score-standard.v${version}.json`), "utf8")));
  if (job.status !== "confirmed" || standard.status !== "confirmed" || standard.jobId !== jobId || standard.version !== version) {
    throw new Error(`岗位 ${jobId} 的评分标准 v${version} 不是已确认版本。`);
  }
  return { job, standard };
}

export async function createStandardRevision(jobId: string): Promise<ScoreStandard> {
  assertSafeJobId(jobId);
  const { standard: current } = await getConfirmedJobStandard(jobId);
  const directory = path.join(jobsDirectory, jobId);
  const files = await readdir(directory);
  const versions = files.flatMap((file) => {
    const match = file.match(/^score-standard\.v(\d+)(?:\.draft)?\.json$/);
    return match ? [Number(match[1])] : [];
  });
  const version = Math.max(current.version, ...versions) + 1;
  const now = new Date().toISOString();
  const draft = ScoreStandardSchema.parse({
    ...current,
    id: `${jobId}-standard-v${version}`,
    version,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  await writeJson(path.join(directory, `score-standard.v${version}.draft.json`), draft, true);
  return draft;
}

export async function saveDraft(jobId: string, standardInput: unknown): Promise<ScoreStandard> {
  assertSafeJobId(jobId);
  const standard = ScoreStandardSchema.parse(standardInput);
  if (standard.jobId !== jobId || standard.status !== "draft") {
    throw new Error("只能保存当前岗位的评分标准草稿。");
  }
  const file = path.join(jobsDirectory, jobId, `score-standard.v${standard.version}.draft.json`);
  await assertJobExists(jobId);
  const current = ScoreStandardSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (standard.id !== current.id || standard.version !== current.version) {
    throw new Error("评分标准版本信息不匹配，请重新加载草稿。");
  }
  const updated = ScoreStandardSchema.parse({ ...standard, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  await writeJson(file, updated);
  return updated;
}

export async function confirmDraft(jobId: string, standardInput: unknown): Promise<{ job: Job; standard: ScoreStandard }> {
  assertSafeJobId(jobId);
  const standard = ScoreStandardSchema.parse(standardInput);
  if (standard.jobId !== jobId || standard.status !== "draft") {
    throw new Error("只能确认当前岗位的评分标准草稿。");
  }
  const directory = path.join(jobsDirectory, jobId);
  const draftFile = path.join(directory, `score-standard.v${standard.version}.draft.json`);
  const current = ScoreStandardSchema.parse(JSON.parse(await readFile(draftFile, "utf8")));
  if (standard.id !== current.id || standard.version !== current.version) {
    throw new Error("评分标准版本信息不匹配，请重新加载草稿。");
  }
  const confirmed = ScoreStandardSchema.parse({ ...standard, status: "confirmed", createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  const job = JobSchema.parse(JSON.parse(await readFile(path.join(directory, "job.json"), "utf8")));
  const confirmedJob = JobSchema.parse({ ...job, status: "confirmed", updatedAt: new Date().toISOString() });
  await writeJson(path.join(directory, `score-standard.v${standard.version}.json`), confirmed, true);
  await writeJson(path.join(directory, "job.json"), confirmedJob);
  return { job: confirmedJob, standard: confirmed };
}

async function assertJobExists(jobId: string): Promise<void> {
  await readFile(path.join(jobsDirectory, jobId, "job.json"), "utf8");
}

async function writeJson(file: string, value: unknown, exclusive = false): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, exclusive ? { encoding: "utf8", flag: "wx" } : "utf8");
}
