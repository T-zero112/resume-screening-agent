import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const originalDirectory = process.cwd();

afterEach(async () => {
  process.chdir(originalDirectory);
  vi.resetModules();
});

it("archives into a job/month folder, preserves duplicates, and removes files after their retention expires", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-archive-test-"));
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    const archive = await import("../src/mail/resume-archive.js");
    const root = path.join(temporaryDirectory, "company-archive");
    const source = path.join(temporaryDirectory, "resume.pdf");
    await writeFile(source, "resume contents");
    await archive.saveResumeArchiveSettings({ enabled: true, directory: root, retentionDays: 30 });
    const savedAt = new Date(2026, 0, 31, 12);
    const first = await archive.archiveResumeFile({ sourcePath: source, originalName: "候选人.pdf", jobTitle: "施工员", source: "email", savedAt });
    const second = await archive.archiveResumeFile({ sourcePath: source, originalName: "候选人.pdf", jobTitle: "施工员", source: "upload", savedAt });

    expect(first.status).toBe("saved");
    expect(second.status).toBe("saved");
    expect(first.path).toContain(path.join("施工员", "2026-01", "候选人.pdf"));
    expect(second.path).toContain("候选人 (2).pdf");
    await expect(readFile(first.path!, "utf8")).resolves.toBe("resume contents");

    const removed = await archive.pruneExpiredArchives(new Date(savedAt.getTime() + 31 * 24 * 60 * 60 * 1000));
    expect(removed).toBe(2);
    await expect(readFile(first.path!)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
