import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { suggestSlugsWithLlm } from "../features/slug-suggestions.js";
import { CandidateFeatureSetSchema } from "../schemas/index.js";

const featureSetPath = process.argv[2];
const outputPath = process.argv[3];

if (!featureSetPath) {
  console.error("Usage: npm run suggest:slugs -- <candidate-features.json> [slug-suggestions.json]");
  process.exit(1);
}

try {
  const featureSet = CandidateFeatureSetSchema.parse(JSON.parse(await readFile(featureSetPath, "utf8")));
  const suggestions = await suggestSlugsWithLlm(featureSet);
  const resolvedOutputPath = outputPath ?? path.join(path.dirname(featureSetPath), "slug-suggestions.json");

  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, `${JSON.stringify({ suggestions }, null, 2)}\n`, "utf8");
  console.log(`Slug suggestions generated: ${resolvedOutputPath}`);
  console.log(`Suggestions: ${suggestions.length}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
