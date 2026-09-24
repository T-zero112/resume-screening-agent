import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfirmedJobStandard } from "../jobs/job-store.js";
import { parseEvidenceInput, scoreResumeWithLlm } from "../scoring/llm-jd-scorer.js";
import { CandidateProfileSchema } from "../schemas/index.js";

const runDirectory = process.argv[2];
const jobId = process.argv[3] ?? "job-regional-sales";
const outputPath = process.argv[4];

if (!runDirectory) {
  console.error("Usage: npm run score:llm -- <parse-output-directory> [job-id] [llm-score-trace.json]");
  process.exit(1);
}

try {
  const parseReport = JSON.parse(await readFile(path.join(runDirectory, "parse-report.json"), "utf8"));
  const evidence = parseEvidenceInput(JSON.parse(await readFile(path.join(runDirectory, "evidence.json"), "utf8")));
  const profile = CandidateProfileSchema.parse(
    JSON.parse(await readFile(path.join(runDirectory, "candidate-profile.json"), "utf8")),
  );
  const { job, standard } = await getConfirmedJobStandard(jobId);
  const generatedAt = new Date().toISOString();
  const result = await scoreResumeWithLlm({
    candidateId: parseReport.candidateId ?? profile.id,
    profile,
    evidence,
    jdText: job.jdText,
    jobId: job.id,
    scorecardId: standard.id,
    scoreStandard: standard,
    generatedAt,
  });
  const resolvedOutputPath = outputPath ?? path.join(runDirectory, `llm-score-${job.id}.json`);

  await writeFile(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`LLM score completed: ${resolvedOutputPath}`);
  console.log(`Final score: ${result.finalScore}`);
  console.log(`Raw score: ${result.rawScore}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
