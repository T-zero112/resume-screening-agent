import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const settingsFile = path.resolve("data/mail/archive-settings.json");
const manifestFile = path.resolve("data/mail/archive-manifest.json");
const allowedRetentionDays = [30, 90, 180, 365] as const;
export type ArchiveRetentionDays = typeof allowedRetentionDays[number] | null;
export type ResumeArchiveSettings = { enabled: boolean; directory: string; retentionDays: ArchiveRetentionDays };
export type ArchiveResult = { status: "saved" | "disabled" | "failed"; path?: string; error?: string };
type ArchiveRecord = { id: string; path: string; root: string; source: "upload" | "email"; savedAt: string; expiresAt?: string };

const defaultSettings: ResumeArchiveSettings = { enabled: false, directory: "", retentionDays: null };
let retentionTimer: NodeJS.Timeout | undefined;
let writeQueue: Promise<void> = Promise.resolve();
const execFileAsync = promisify(execFile);

export async function selectWindowsArchiveDirectory(): Promise<string | undefined> {
  if (process.platform !== "win32") throw new Error("浏览器模式下的系统目录选择器仅支持 Windows；请使用桌面版在其他系统选择文件夹。");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = '选择简历归档文件夹'",
    "$dialog.ShowNewFolderButton = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  [Console]::WriteLine($dialog.SelectedPath)",
    "}",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
    windowsHide: true,
    timeout: 5 * 60 * 1000,
    encoding: "utf8",
  });
  const directory = stdout.trim();
  return directory || undefined;
}

export async function getResumeArchiveSettings(): Promise<ResumeArchiveSettings> {
  return readFile(settingsFile, "utf8").then((text) => parseSettings(JSON.parse(text)))
    .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? defaultSettings : Promise.reject(error));
}

export async function saveResumeArchiveSettings(input: ResumeArchiveSettings): Promise<ResumeArchiveSettings> {
  const settings = parseSettings(input);
  if (settings.enabled && !settings.directory) throw new Error("启用归档前，请先选择归档文件夹。");
  if (settings.enabled && settings.directory) {
    await mkdir(settings.directory, { recursive: true });
    await access(settings.directory);
    const probe = path.join(settings.directory, `.resume-archive-check-${randomUUID()}`);
    await writeFile(probe, "", { flag: "wx" });
    await rm(probe, { force: true });
  }
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const temporary = `${settingsFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporary, settingsFile);
  return settings;
}

export async function archiveResumeFile(input: {
  sourcePath: string;
  originalName: string;
  jobTitle: string;
  source: "upload" | "email";
  savedAt?: Date;
}): Promise<ArchiveResult> {
  const settings = await getResumeArchiveSettings();
  if (!settings.enabled) return { status: "disabled" };
  const savedAt = input.savedAt ?? new Date();
  const date = savedAt.toISOString();
  const month = `${savedAt.getFullYear()}-${String(savedAt.getMonth() + 1).padStart(2, "0")}`;
  const jobDirectory = sanitizeSegment(input.jobTitle) || "未命名岗位";
  const targetDirectory = path.join(settings.directory, jobDirectory, month);
  const safeName = sanitizeFilename(input.originalName);
  await mkdir(targetDirectory, { recursive: true });
  const parsed = path.parse(safeName);
  let targetPath = path.join(targetDirectory, safeName);
  let suffix = 2;
  try {
    while (true) {
      try {
        await copyFile(input.sourcePath, targetPath, constants.COPYFILE_EXCL);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        targetPath = path.join(targetDirectory, `${parsed.name} (${suffix++})${parsed.ext}`);
      }
    }
    const record: ArchiveRecord = {
      id: randomUUID(),
      path: targetPath,
      root: path.resolve(settings.directory),
      source: input.source,
      savedAt: date,
      expiresAt: settings.retentionDays === null
        ? undefined
        : new Date(savedAt.getTime() + settings.retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    };
    await updateManifest((records) => [...records, record]);
    return { status: "saved", path: targetPath };
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => undefined);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export function startArchiveRetention(): () => void {
  if (retentionTimer) return () => undefined;
  void pruneExpiredArchives().catch((error: unknown) => console.error("简历归档保留期清理失败：", error));
  retentionTimer = setInterval(() => {
    void pruneExpiredArchives().catch((error: unknown) => console.error("简历归档保留期清理失败：", error));
  }, 24 * 60 * 60 * 1000);
  retentionTimer.unref();
  return () => {
    if (retentionTimer) clearInterval(retentionTimer);
    retentionTimer = undefined;
  };
}

export async function pruneExpiredArchives(now = new Date()): Promise<number> {
  return withManifestLock(async () => {
    const records = await readManifest();
    const kept: ArchiveRecord[] = [];
    let removed = 0;
    for (const record of records) {
      const expiresAt = record.expiresAt ? new Date(record.expiresAt).getTime() : undefined;
      if (expiresAt === undefined || Number.isNaN(expiresAt) || expiresAt > now.getTime()) {
        kept.push(record);
        continue;
      }
      const [realRoot, realFile] = await Promise.all([
        realpath(record.root).catch(() => ""),
        realpath(record.path).catch(() => ""),
      ]);
      if (!realRoot || !realFile || !isInside(realRoot, realFile)) {
        if (!realFile) {
          removed += 1;
          continue;
        }
        kept.push(record);
        continue;
      }
      await rm(record.path, { force: true });
      removed += 1;
    }
    if (removed) await writeManifest(kept);
    return removed;
  });
}

function parseSettings(value: unknown): ResumeArchiveSettings {
  if (!value || typeof value !== "object") throw new Error("归档设置格式无效。");
  const candidate = value as Partial<ResumeArchiveSettings>;
  if (typeof candidate.enabled !== "boolean" || typeof candidate.directory !== "string") throw new Error("归档设置格式无效。");
  const rawDirectory = candidate.directory.trim();
  if (rawDirectory && !path.isAbsolute(rawDirectory)) throw new Error("归档文件夹必须是绝对路径。");
  const directory = rawDirectory ? path.resolve(rawDirectory) : "";
  const retentionDays = candidate.retentionDays;
  if (retentionDays !== null && !allowedRetentionDays.includes(retentionDays as typeof allowedRetentionDays[number])) throw new Error("归档保留时间无效。");
  return { enabled: candidate.enabled, directory, retentionDays: retentionDays ?? null };
}

function sanitizeSegment(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 100);
}

function sanitizeFilename(value: string): string {
  const safe = path.basename(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 150);
  return safe || `简历-${randomUUID()}.bin`;
}

async function readManifest(): Promise<ArchiveRecord[]> {
  return readFile(manifestFile, "utf8").then((text) => JSON.parse(text) as ArchiveRecord[]).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

async function updateManifest(update: (records: ArchiveRecord[]) => ArchiveRecord[]): Promise<void> {
  await withManifestLock(async () => writeManifest(update(await readManifest())));
}

async function writeManifest(records: ArchiveRecord[]): Promise<void> {
  await mkdir(path.dirname(manifestFile), { recursive: true });
  const temporary = `${manifestFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(temporary, manifestFile);
}

async function withManifestLock<T>(action: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

function isInside(root: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
