import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseReviewResolutionInputs, resolveReviewTasksWithLlm } from "../review/llm-review-resolver.js";

const runDirectory = process.argv[2];
const maxTasksArg = process.argv[3];

if (!runDirectory) {
  console.error("Usage: npm run resolve:review -- <parse-output-directory> [maxTasks]");
  process.exit(1);
}

try {
  const reviewTasksPath = path.join(runDirectory, "review-tasks.json");
  const evidencePath = path.join(runDirectory, "evidence.json");
  const { reviewTaskSet, evidence } = parseReviewResolutionInputs(
    JSON.parse(await readFile(reviewTasksPath, "utf8")),
    JSON.parse(await readFile(evidencePath, "utf8")),
  );
  const maxTasks = maxTasksArg ? Number.parseInt(maxTasksArg, 10) : undefined;
  const generatedAt = new Date().toISOString();
  const resolutionSet = await resolveReviewTasksWithLlm({
    reviewTaskSet,
    evidence,
    generatedAt,
    maxTasks,
  });
  const report = {
    schemaVersion: "review-resolution-report.v1",
    candidateId: resolutionSet.candidateId,
    resolvedCount: resolutionSet.resolutions.length,
    skippedCount: resolutionSet.skippedTaskIds.length,
    statusCounts: countBy(resolutionSet.resolutions.map((resolution) => resolution.status)),
    shouldAffectScoringCount: resolutionSet.resolutions.filter((resolution) => resolution.shouldAffectScoring).length,
    llm: resolutionSet.llm,
    generatedAt,
  };

  await writeJson(path.join(runDirectory, "review-resolutions.json"), resolutionSet);
  await writeJson(path.join(runDirectory, "review-resolution-report.json"), report);
  console.log(`Review task resolution completed: ${path.resolve(runDirectory)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
