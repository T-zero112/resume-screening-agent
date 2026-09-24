import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateCandidate } from "../scoring/score-engine.js";
import { CandidateFeatureSetSchema, ScorecardSchema } from "../schemas/index.js";

const featureSetPath = process.argv[2];
const scorecardPath = process.argv[3];
const outputPath = process.argv[4];

if (!featureSetPath || !scorecardPath) {
  console.error("Usage: npm run score -- <candidate-features.json> <scorecard.json> [evaluation-result.json]");
  process.exit(1);
}

try {
  const featureSet = CandidateFeatureSetSchema.parse(JSON.parse(await readFile(featureSetPath, "utf8")));
  const scorecard = ScorecardSchema.parse(JSON.parse(await readFile(scorecardPath, "utf8")));
  const result = evaluateCandidate(featureSet, scorecard);
  const resolvedOutputPath =
    outputPath ?? path.join(path.dirname(featureSetPath), `evaluation-${scorecard.jobId}-v${scorecard.version}.json`);

  await writeFile(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Evaluation completed: ${resolvedOutputPath}`);
  console.log(`Hard requirements: ${result.hardRequirementStatus}`);
  console.log(`Total score: ${result.totalScore}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
