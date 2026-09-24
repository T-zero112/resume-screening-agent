import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCandidateReview } from "../review/candidate-review.js";
import { EvaluationResultSchema } from "../schemas/index.js";

const evaluationPath = process.argv[2];
const outputPath = process.argv[3];

if (!evaluationPath) {
  console.error("Usage: npm run review -- <evaluation-result.json> [candidate-review.json]");
  process.exit(1);
}

try {
  const evaluation = EvaluationResultSchema.parse(JSON.parse(await readFile(evaluationPath, "utf8")));
  const review = buildCandidateReview(evaluation);
  const resolvedOutputPath = outputPath ?? path.join(path.dirname(evaluationPath), "candidate-review.json");

  await writeFile(resolvedOutputPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  console.log(`Candidate review generated: ${resolvedOutputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
