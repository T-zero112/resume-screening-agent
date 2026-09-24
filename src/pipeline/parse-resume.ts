import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extractResumeWithLlm } from "../extraction/llm-extractor.js";
import { buildFeatureReport } from "../features/feature-report.js";
import { generateCandidateFeatures } from "../features/generate-features.js";
import { buildEvidenceFromDocumentText } from "../parsing/evidence-builder.js";
import { extractDocumentText } from "../parsing/document-text.js";
import { buildParseQualityReport } from "../parsing/parse-quality.js";
import { extractSourceMetadata } from "../parsing/source-metadata.js";
import { ensureResumePhoto } from "../parsing/resume-photo.js";
import { buildReviewTasks } from "../review/review-tasks.js";

export type ParseResumeOptions = {
  filePath: string;
  outputRoot?: string;
  model?: string;
  signal?: AbortSignal;
};

export async function parseResume(options: ParseResumeOptions): Promise<string> {
  const startedAt = new Date().toISOString();
  const runId = buildRunId(startedAt);
  const outputDirectory = path.resolve(options.outputRoot ?? "outputs", runId);
  const candidateId = `candidate-${randomUUID()}`;
  const sourceMetadata = extractSourceMetadata(options.filePath);

  await mkdir(outputDirectory, { recursive: true });

  await ensureResumePhoto(options.filePath, outputDirectory);

  const documentText = await extractDocumentText(options.filePath);
  const evidence = buildEvidenceFromDocumentText(documentText, options.filePath, startedAt);

  await writeJson(path.join(outputDirectory, "document-text.json"), documentText);
  await writeJson(path.join(outputDirectory, "evidence.json"), evidence);

  const extraction = await extractResumeWithLlm({
    candidateId,
    evidence,
    createdAt: startedAt,
    model: options.model,
    signal: options.signal,
  });
  const featureSet = generateCandidateFeatures(extraction.candidateProfile, extraction.facts, new Date().toISOString());
  const featureReport = buildFeatureReport(featureSet, new Date().toISOString());
  const completedAt = new Date().toISOString();
  const parseQualityReport = buildParseQualityReport({
    sourceFilePath: options.filePath,
    documentName: documentText.documentName,
    documentType: documentText.documentType,
    evidence,
    facts: extraction.facts,
    candidateProfile: extraction.candidateProfile,
    featureSet,
    llmWarnings: extraction.warnings,
    generatedAt: completedAt,
  });
  const reviewTaskSet = buildReviewTasks({
    candidateId,
    sourceFilePath: path.resolve(options.filePath),
    candidateProfile: extraction.candidateProfile,
    parseQualityReport,
    llmWarnings: extraction.warnings,
    sourceMetadata,
    generatedAt: completedAt,
  });

  await writeJson(path.join(outputDirectory, "facts.json"), extraction.facts);
  await writeJson(path.join(outputDirectory, "candidate-profile.json"), extraction.candidateProfile);
  await writeJson(path.join(outputDirectory, "candidate-features.json"), featureSet);
  await writeJson(path.join(outputDirectory, "feature-report.json"), featureReport);
  await writeJson(path.join(outputDirectory, "parse-quality-report.json"), parseQualityReport);
  await writeJson(path.join(outputDirectory, "source-metadata.json"), sourceMetadata);
  await writeJson(path.join(outputDirectory, "review-tasks.json"), reviewTaskSet);
  await writeJson(path.join(outputDirectory, "parse-report.json"), {
    runId,
    candidateId,
    sourceFilePath: path.resolve(options.filePath),
    documentName: documentText.documentName,
    documentType: documentText.documentType,
    sourceMetadata,
    evidenceCount: evidence.length,
    factCount: extraction.facts.length,
    featureCount: featureSet.features.length,
    warnings: extraction.warnings,
    documentWarnings: documentText.warnings ?? [],
    pdfTriage: documentText.pdfTriage,
    qualityStatus: parseQualityReport.status,
    reviewTaskCount: reviewTaskSet.tasks.length,
    llm: extraction.llmConfig,
    startedAt,
    completedAt,
  });

  return outputDirectory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildRunId(isoDate: string): string {
  return isoDate.replace(/[:.]/g, "-");
}
