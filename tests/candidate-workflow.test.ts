import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const originalDirectory = process.cwd();

afterEach(() => {
  process.chdir(originalDirectory);
  vi.resetModules();
});

it("persists independent HR stages per candidate and allows clearing a stage", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "candidate-workflow-test-"));
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    const workflow = await import("../src/jobs/candidate-workflow.js");
    await workflow.updateCandidateStage("job-1", "candidate-a", "interview");
    await workflow.updateCandidateStage("job-1", "candidate-b", "pending");
    await workflow.updateCandidateStage("job-1", "candidate-a", null);

    await expect(workflow.readCandidateStages("job-1")).resolves.toEqual({ "candidate-b": "pending" });
    const saved = JSON.parse(await readFile(path.join(temporaryDirectory, "data/jobs/job-1/candidate-workflow.json"), "utf8"));
    expect(saved["candidate-b"]).toMatchObject({ stage: "pending" });
    expect(saved["candidate-b"].updatedAt).toBeTruthy();
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

it("serializes concurrent stage changes without losing updates", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "candidate-workflow-concurrency-test-"));
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    const workflow = await import("../src/jobs/candidate-workflow.js");
    await Promise.all([
      workflow.updateCandidateStage("job-2", "candidate-a", "interview"),
      workflow.updateCandidateStage("job-2", "candidate-b", "rejected"),
      workflow.updateCandidateStage("job-2", "candidate-c", "pending"),
    ]);

    await expect(workflow.readCandidateStages("job-2")).resolves.toEqual({
      "candidate-a": "interview",
      "candidate-b": "rejected",
      "candidate-c": "pending",
    });
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
