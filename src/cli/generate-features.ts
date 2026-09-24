import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CandidateProfileSchema,
  FactSchema,
} from "../schemas/index.js";
import { buildFeatureReport } from "../features/feature-report.js";
import { generateCandidateFeatures } from "../features/generate-features.js";

const outputDirectory = process.argv[2];

if (!outputDirectory) {
  console.error("Usage: npm run generate:features -- <outputs/run-id>");
  process.exit(1);
}

try {
  const profilePath = path.join(outputDirectory, "candidate-profile.json");
  const factsPath = path.join(outputDirectory, "facts.json");
  const featuresPath = path.join(outputDirectory, "candidate-features.json");
  const reportPath = path.join(outputDirectory, "feature-report.json");

  const profile = CandidateProfileSchema.parse(JSON.parse(await readFile(profilePath, "utf8")));
  const facts = FactSchema.array().parse(JSON.parse(await readFile(factsPath, "utf8")));
  const featureSet = generateCandidateFeatures(profile, facts);
  const featureReport = buildFeatureReport(featureSet);

  await writeFile(featuresPath, `${JSON.stringify(featureSet, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(featureReport, null, 2)}\n`, "utf8");
  console.log(`Generated features: ${featuresPath}`);
  console.log(`Generated feature report: ${reportPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
