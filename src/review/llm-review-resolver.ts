import OpenAI from "openai";
import { z } from "zod";

import { resolveLlmConfig, type LlmConfig } from "../extraction/llm-config.js";
import {
  EvidenceSchema,
  ReviewResolutionSetSchema,
  ReviewTaskSetSchema,
  type Evidence,
  type ReviewResolution,
  type ReviewResolutionSet,
  type ReviewTask,
  type ReviewTaskSet,
} from "../schemas/index.js";
import { withLlmTrace } from "../observability/langsmith.js";

export type ResolveReviewTasksOptions = {
  reviewTaskSet: ReviewTaskSet;
  evidence: Evidence[];
  generatedAt: string;
  model?: string;
  maxTasks?: number;
  signal?: AbortSignal;
};

const LlmReviewResolutionResultSchema = z.object({
  resolutions: z.array(
    z.object({
      taskId: z.string().min(1),
      status: z.enum(["resolved", "still_needs_human", "not_enough_evidence"]),
      answer: z.string().min(1),
      confidence: z.number().min(0).max(1),
      shouldAffectScoring: z.boolean(),
      suggestedAction: z.string().min(1),
      evidenceRefs: z.array(z.object({ evidenceId: z.string().min(1), quote: z.string().optional() })).default([]),
    }),
  ),
});

const resolutionJsonSchema = z.toJSONSchema(LlmReviewResolutionResultSchema);

export async function resolveReviewTasksWithLlm(options: ResolveReviewTasksOptions): Promise<ReviewResolutionSet> {
  const candidateTasks = options.reviewTaskSet.tasks
    .filter((task) => shouldResolveWithLlm(task))
    .slice(0, options.maxTasks ?? 5);
  const skippedTaskIds = options.reviewTaskSet.tasks
    .filter((task) => !candidateTasks.some((candidateTask) => candidateTask.id === task.id))
    .map((task) => task.id);

  if (candidateTasks.length === 0) {
    return ReviewResolutionSetSchema.parse({
      schemaVersion: "review-resolutions.v1",
      candidateId: options.reviewTaskSet.candidateId,
      sourceFilePath: options.reviewTaskSet.sourceFilePath,
      resolutions: [],
      skippedTaskIds,
      generatedAt: options.generatedAt,
    });
  }

  const llmConfig = resolveLlmConfig(options.model);
  const response = await createResolutionResponse({
    llmConfig,
    tasks: candidateTasks,
    evidence: options.evidence,
    signal: options.signal,
  });
  const parsed = LlmReviewResolutionResultSchema.parse(parseJsonObject(response.output_text));
  const validEvidenceIds = new Set(options.evidence.map((item) => item.id));
  const validTaskIds = new Set(candidateTasks.map((task) => task.id));
  const resolutions = parsed.resolutions
    .filter((resolution) => validTaskIds.has(resolution.taskId))
    .map((resolution): ReviewResolution => ({
      ...resolution,
      evidenceRefs: resolution.evidenceRefs.filter((ref) => validEvidenceIds.has(ref.evidenceId)),
    }));

  return ReviewResolutionSetSchema.parse({
    schemaVersion: "review-resolutions.v1",
    candidateId: options.reviewTaskSet.candidateId,
    sourceFilePath: options.reviewTaskSet.sourceFilePath,
    resolutions,
    skippedTaskIds,
    generatedAt: options.generatedAt,
    llm: {
      provider: llmConfig.provider,
      baseURL: llmConfig.baseURL,
      model: llmConfig.model,
    },
  });
}

function shouldResolveWithLlm(task: ReviewTask): boolean {
  if (task.resolutionMode !== "llm_candidate" || task.status !== "open") {
    return false;
  }

  return task.type === "timeline_conflict" || task.type === "experience_attribution_unclear";
}

async function createResolutionResponse(options: {
  llmConfig: LlmConfig;
  tasks: ReviewTask[];
  evidence: Evidence[];
  signal?: AbortSignal;
}) {
  const client = new OpenAI({
    apiKey: options.llmConfig.apiKey,
    baseURL: options.llmConfig.baseURL,
  });

  return withLlmTrace({
    operation: "review_resolution",
    provider: options.llmConfig.provider,
    model: options.llmConfig.model,
    baseURL: options.llmConfig.baseURL,
    evidenceCount: options.evidence.length,
    inputCharacters: options.tasks.reduce((sum, task) => sum + task.question.length + (task.recommendation?.length ?? 0), 0)
      + options.evidence.reduce((sum, item) => sum + item.rawText.length, 0),
    taskCount: options.tasks.length,
  }, () => client.responses.create(
    {
      model: options.llmConfig.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildSystemPrompt(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(options.tasks, options.evidence),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "review_resolution_result",
          strict: false,
          schema: resolutionJsonSchema,
        },
      },
    },
    { signal: options.signal },
  ));
}

function buildSystemPrompt(): string {
  return [
    "你是招聘简历解析 Agent 的复核任务解析器。",
    "你只处理给定 review tasks，不重新抽取整份简历。",
    "你只能依据用户提供的 Evidence 文本回答，不要编造。",
    "你的目标是判断疑点是否可以被现有证据解释、是否仍需人工确认、是否可能影响后续评分。",
    "不要修改 candidateProfile，不要输出新的候选人画像。",
    "输出必须是 JSON，并严格符合 schema。",
    "status 只能使用 resolved、still_needs_human、not_enough_evidence。",
    "如果证据不足，不要猜测，使用 not_enough_evidence。",
    "如果有冲突但无法可靠裁定，使用 still_needs_human。",
  ].join("\n");
}

function buildUserPrompt(tasks: ReviewTask[], evidence: Evidence[]): string {
  return [
    "Review tasks:",
    JSON.stringify(
      tasks.map((task) => ({
        id: task.id,
        type: task.type,
        severity: task.severity,
        question: task.question,
        recommendation: task.recommendation,
      })),
      null,
      2,
    ),
    "",
    "Evidence:",
    buildEvidencePayload(evidence),
  ].join("\n");
}

function buildEvidencePayload(evidence: Evidence[]): string {
  return evidence
    .map((item) =>
      [
        `evidenceId: ${item.id}`,
        item.source.pageNumber ? `pageNumber: ${item.source.pageNumber}` : undefined,
        item.source.blockIndex !== undefined ? `blockIndex: ${item.source.blockIndex}` : undefined,
        "rawText:",
        item.rawText,
        "---",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence);
}

export function parseReviewResolutionInputs(reviewTaskSet: unknown, evidence: unknown): {
  reviewTaskSet: ReviewTaskSet;
  evidence: Evidence[];
} {
  return {
    reviewTaskSet: ReviewTaskSetSchema.parse(reviewTaskSet),
    evidence: z.array(EvidenceSchema).parse(evidence),
  };
}
