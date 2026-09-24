import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseResume } from "./parse-resume.js";

const supportedExtensions = new Set([".pdf", ".docx", ".txt"]);

export type BatchParseOptions = {
  inputDirectory: string;
  outputRoot?: string;
  model?: string;
  itemTimeoutMs?: number;
  maxAttempts?: number;
  onProgress?: (message: string) => void;
};

export type BatchParseItem = {
  sourceFilePath: string;
  status: "completed" | "failed";
  outputDirectory?: string;
  documentName?: string;
  documentType?: string;
  qualityStatus?: string;
  evidenceCount?: number;
  factCount?: number;
  featureCount?: number;
  warningCount?: number;
  qualitySignalCount?: number;
  errorMessage?: string;
};

export type BatchParseReport = {
  schemaVersion: "batch-parse-report.v1";
  inputDirectory: string;
  outputDirectory: string;
  totalFileCount: number;
  completedCount: number;
  failedCount: number;
  qualityStatusCounts: Record<string, number>;
  items: BatchParseItem[];
  startedAt: string;
  completedAt: string;
};

export async function parseResumeBatch(options: BatchParseOptions): Promise<string> {
  const startedAt = new Date().toISOString();
  const outputDirectory = path.resolve(options.outputRoot ?? "outputs", `batch-${buildRunId(startedAt)}`);
  const resumeFiles = await listResumeFiles(options.inputDirectory);
  const itemOutputRoot = path.join(outputDirectory, "items");
  const items: BatchParseItem[] = [];
  const itemTimeoutMs = options.itemTimeoutMs ?? 300_000;
  const maxAttempts = options.maxAttempts ?? 2;

  await mkdir(itemOutputRoot, { recursive: true });

  for (const [index, filePath] of resumeFiles.entries()) {
    const progressPrefix = `[${index + 1}/${resumeFiles.length}] ${path.basename(filePath)}`;

    try {
      options.onProgress?.(`${progressPrefix} parsing`);
      const itemOutputDirectory = await parseWithRetry({
        filePath,
        outputRoot: itemOutputRoot,
        model: options.model,
        itemTimeoutMs,
        maxAttempts,
        onProgress: options.onProgress,
        progressPrefix,
      });
      const parseReport = await readJson<{
        documentName: string;
        documentType: string;
        evidenceCount: number;
        factCount: number;
        featureCount: number;
        warnings: unknown[];
        qualityStatus: string;
      }>(path.join(itemOutputDirectory, "parse-report.json"));
      const qualityReport = await readJson<{ signals: unknown[] }>(
        path.join(itemOutputDirectory, "parse-quality-report.json"),
      );

      items.push({
        sourceFilePath: path.resolve(filePath),
        status: "completed",
        outputDirectory: itemOutputDirectory,
        documentName: parseReport.documentName,
        documentType: parseReport.documentType,
        qualityStatus: parseReport.qualityStatus,
        evidenceCount: parseReport.evidenceCount,
        factCount: parseReport.factCount,
        featureCount: parseReport.featureCount,
        warningCount: parseReport.warnings.length,
        qualitySignalCount: qualityReport.signals.length,
      });
      options.onProgress?.(`${progressPrefix} completed (${parseReport.qualityStatus})`);
    } catch (error) {
      items.push({
        sourceFilePath: path.resolve(filePath),
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      options.onProgress?.(`${progressPrefix} failed`);
    }
  }

  const completedAt = new Date().toISOString();
  const report: BatchParseReport = {
    schemaVersion: "batch-parse-report.v1",
    inputDirectory: path.resolve(options.inputDirectory),
    outputDirectory,
    totalFileCount: resumeFiles.length,
    completedCount: items.filter((item) => item.status === "completed").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    qualityStatusCounts: countQualityStatuses(items),
    items,
    startedAt,
    completedAt,
  };

  await writeJson(path.join(outputDirectory, "batch-parse-report.json"), report);
  await writeFile(path.join(outputDirectory, "batch-parse-report.csv"), toCsv(items), "utf8");

  return outputDirectory;
}

async function parseWithRetry(options: {
  filePath: string;
  outputRoot: string;
  model?: string;
  itemTimeoutMs: number;
  maxAttempts: number;
  progressPrefix: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();

    try {
      return await withTimeout(
        parseResume({
          filePath: options.filePath,
          outputRoot: options.outputRoot,
          model: options.model,
          signal: controller.signal,
        }),
        options.itemTimeoutMs,
        controller,
        `Timed out after ${options.itemTimeoutMs}ms`,
      );
    } catch (error) {
      lastError = error;
      if (attempt < options.maxAttempts) {
        options.onProgress?.(`${options.progressPrefix} retrying (${attempt + 1}/${options.maxAttempts})`);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function toCsv(items: BatchParseItem[]): string {
  const headers = [
    "status",
    "qualityStatus",
    "documentName",
    "documentType",
    "evidenceCount",
    "factCount",
    "featureCount",
    "warningCount",
    "qualitySignalCount",
    "sourceFilePath",
    "outputDirectory",
    "errorMessage",
  ];
  const rows = items.map((item) =>
    [
      item.status,
      item.qualityStatus ?? "",
      item.documentName ?? "",
      item.documentType ?? "",
      item.evidenceCount ?? "",
      item.factCount ?? "",
      item.featureCount ?? "",
      item.warningCount ?? "",
      item.qualitySignalCount ?? "",
      item.sourceFilePath,
      item.outputDirectory ?? "",
      item.errorMessage ?? "",
    ].map(csvCell).join(","),
  );

  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

async function listResumeFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return listResumeFiles(entryPath);
      }

      if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedFiles.flat().sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function countQualityStatuses(items: BatchParseItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const status = item.status === "completed" ? item.qualityStatus ?? "unknown" : "parse_failed";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildRunId(isoDate: string): string {
  return isoDate.replace(/[:.]/g, "-");
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
