import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const batchDirectory = process.argv[2] ?? "outputs/batch-2026-09-20T04-22-33-651Z";
const outputPath = process.argv[3] ?? "public/viewer-data.json";
const extraCandidateDirectories = process.argv.slice(4);

type ViewerCandidate = {
  id: string;
  name: string;
  documentName: string;
  outputDirectory: string;
  parseStatus: string;
  totalScore?: number;
  rawScore?: number;
  scoreMode: "llm" | "rule" | "none";
  scoreReason?: string;
  scoreMissing?: string;
  scoreCaps?: string[];
  hardGaps?: string[];
  hardRequirementStatus?: string;
  dimensions: Array<{ name: string; score: number; weightedScore: number }>;
  requirementEvaluations: Array<{
    id: string;
    description: string;
    status: string;
    featureKey: string;
    featureDisplayValue?: string;
    explanation: string;
    evidenceQuotes: string[];
  }>;
  reviewTasks: Array<{
    id: string;
    type: string;
    severity: string;
    question: string;
    resolutionMode: string;
    status: string;
    recommendation?: string;
  }>;
  reviewResolutions: Array<{
    taskId: string;
    status: string;
    confidence: number;
    shouldAffectScoring: boolean;
    answer: string;
    suggestedAction: string;
    evidenceRefs: Array<{ evidenceId: string; quote?: string }>;
  }>;
  evidence: Array<{ id: string; text: string; pageNumber?: number; blockIndex?: number }>;
  profile: {
    education: string[];
    workExperience: string[];
    skills: string[];
    preference: string[];
  };
};

const batchReport = await readJson<{ items: Array<{ status: string; outputDirectory?: string; documentName?: string }> }>(
  path.join(batchDirectory, "batch-parse-report.json"),
);
const candidates: ViewerCandidate[] = [];

for (const item of batchReport.items.filter((entry) => entry.status === "completed" && entry.outputDirectory)) {
  await addCandidate(item.outputDirectory as string, item.documentName);
}

for (const directory of extraCandidateDirectories) {
  await addCandidate(directory);
}

async function addCandidate(directory: string, documentName?: string): Promise<void> {
  const parseReport = await readOptionalJson<any>(path.join(directory, "parse-report.json"));
  const profile = await readOptionalJson<any>(path.join(directory, "candidate-profile.json"));
  const evaluation = await readOptionalJson<any>(path.join(directory, "evaluation-regional-sales.json"));
  const llmScore = await readLatestLlmScore(directory);
  const tasks = await readOptionalJson<any>(path.join(directory, "review-tasks.json"));
  const resolutions = await readOptionalJson<any>(path.join(directory, "review-resolutions.json"));
  const evidence = await readOptionalJson<any[]>(path.join(directory, "evidence.json"));

  candidates.push({
    id: parseReport?.candidateId ?? profile?.id ?? directory,
    name: profile?.contactInfo?.name ?? documentName ?? "未命名候选人",
    documentName: documentName ?? parseReport?.documentName ?? path.basename(directory),
    outputDirectory: directory,
    parseStatus: parseReport?.qualityStatus ?? "unknown",
    totalScore: llmScore?.finalScore ?? evaluation?.totalScore,
    rawScore: llmScore?.rawScore,
    scoreMode: llmScore ? "llm" : evaluation ? "rule" : "none",
    scoreReason: llmScore?.reason,
    scoreMissing: llmScore?.missing,
    scoreCaps: llmScore?.caps ?? [],
    hardGaps: llmScore?.hardGaps ?? [],
    hardRequirementStatus: evaluation?.hardRequirementStatus,
    dimensions: llmScore
      ? llmScore.components.map((component: any) => ({
          name: component.name,
          score: component.score,
          weightedScore: component.maxScore,
        }))
      : (evaluation?.dimensions ?? []).map((dimension: any) => ({
          name: dimension.name,
          score: dimension.score,
          weightedScore: dimension.weightedScore,
        })),
    requirementEvaluations: llmScore
      ? llmScore.components.map((component: any) => ({
          id: component.key,
          description: component.name,
          status: "scored",
          featureKey: component.key,
          featureDisplayValue: `${component.score}/${component.maxScore}`,
          explanation: component.evidence,
          evidenceQuotes: [],
        }))
      : (evaluation?.requirementEvaluations ?? []).map((requirement: any) => ({
          id: requirement.requirementId,
          description: requirement.description,
          status: requirement.status,
          featureKey: requirement.featureKey,
          featureDisplayValue: requirement.featureDisplayValue,
          explanation: requirement.explanation,
          evidenceQuotes: (requirement.evidenceRefs ?? []).map((ref: any) => ref.quote).filter(Boolean),
        })),
    reviewTasks: (tasks?.tasks ?? []).map((task: any) => ({
      id: task.id,
      type: task.type,
      severity: task.severity,
      question: task.question,
      resolutionMode: task.resolutionMode,
      status: task.status,
      recommendation: task.recommendation,
    })),
    reviewResolutions: resolutions?.resolutions ?? [],
    evidence: (evidence ?? []).map((entry) => ({
      id: entry.id,
      text: entry.rawText,
      pageNumber: entry.source?.pageNumber,
      blockIndex: entry.source?.blockIndex,
    })),
    profile: {
      education: (profile?.education ?? []).map((entry: any) =>
        [entry.school, entry.degree, entry.major].filter(Boolean).join(" / "),
      ),
      workExperience: (profile?.workExperience ?? []).map((entry: any) =>
        [entry.company, entry.title, entry.dateRange?.raw].filter(Boolean).join(" / "),
      ),
      skills: (profile?.skills ?? []).map((entry: any) => entry.name).filter(Boolean),
      preference: [
        ...(profile?.jobPreference?.expectedTitles ?? []),
        ...(profile?.jobPreference?.expectedLocations ?? []),
        profile?.jobPreference?.expectedSalary,
      ].filter(Boolean),
    },
  });
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), batchDirectory: path.resolve(batchDirectory), candidates }, null, 2)}\n`,
  "utf8",
);
console.log(`Viewer data exported: ${path.resolve(outputPath)}`);

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJson<T>(filePath);
  } catch {
    return undefined;
  }
}

async function readLatestLlmScore(directory: string): Promise<any | undefined> {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    return undefined;
  }
  const scores = await Promise.all(files.filter((file) => /^llm-score-.*\.json$/.test(file)).map(async (file) => {
    const result = await readOptionalJson<any>(path.join(directory, file));
    return result?.generatedAt ? result : undefined;
  }));
  return scores.filter(Boolean).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0];
}
