import OpenAI from "openai";
import { z } from "zod";

import {
  CandidateProfileSchema,
  FactSchema,
  type CandidateProfile,
  type Evidence,
  type Fact,
} from "../schemas/index.js";
import { resolveLlmConfig, type LlmConfig } from "./llm-config.js";
import { withLlmTrace } from "../observability/langsmith.js";

export type LlmExtractionResult = {
  candidateProfile: CandidateProfile;
  facts: Fact[];
  warnings: string[];
  llmConfig: Omit<LlmConfig, "apiKey">;
};

const LlmExtractionResultSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  facts: z.array(FactSchema),
  warnings: z.array(z.string()).default([]),
});

type ExtractWithLlmOptions = {
  candidateId: string;
  evidence: Evidence[];
  createdAt: string;
  model?: string;
  signal?: AbortSignal;
};

const extractionJsonSchema = z.toJSONSchema(LlmExtractionResultSchema);

export async function extractResumeWithLlm(options: ExtractWithLlmOptions): Promise<LlmExtractionResult> {
  const llmConfig = resolveLlmConfig(options.model);
  const client = new OpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseURL,
  });
  const inputTextLimit = Number.parseInt(process.env.MAX_LLM_INPUT_CHARS ?? "60000", 10);
  const evidencePayload = buildEvidencePayload(options.evidence, inputTextLimit);

  const response = await withLlmTrace({
    operation: "resume_extraction",
    provider: llmConfig.provider,
    model: llmConfig.model,
    baseURL: llmConfig.baseURL,
    evidenceCount: options.evidence.length,
    inputCharacters: evidencePayload.length,
  }, () => client.responses.create(
    {
      model: llmConfig.model,
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
              text: buildUserPrompt(options.candidateId, options.createdAt, evidencePayload),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "resume_extraction_result",
          strict: false,
          schema: extractionJsonSchema,
        },
      },
    },
    { signal: options.signal },
  ));

  const parsedJson = parseJsonObject(response.output_text);
  return {
    ...LlmExtractionResultSchema.parse(parsedJson),
    llmConfig: {
      provider: llmConfig.provider,
      baseURL: llmConfig.baseURL,
      model: llmConfig.model,
    },
  };
}

function buildSystemPrompt(): string {
  return [
    "你是招聘简历解析 Agent 的结构化抽取模块。",
    "你只从用户提供的 Evidence 文本块中抽取信息，不要编造。",
    "输出必须是 JSON，包含 candidateProfile、facts、warnings。",
    "必须严格使用 JSON Schema 中的英文字段名，不要输出中文字段名或自创字段。",
    "candidateProfile.contactInfo 是必填对象，即使只抽到姓名也要输出 contactInfo。",
    "skills 必须是对象数组，每项至少包含 name 和 category。category 必须使用枚举值，例如 programming_language、framework、tool、domain、other。",
    "languages 必须是对象数组，每项至少包含 language。",
    "facts 必须是对象数组，每个 Fact 必须包含 kind、subject、predicate、object、evidenceRefs、createdAt。",
    "Fact.kind 必须使用枚举值：education、employment、project、skill、certificate、achievement、domain_experience、language、job_preference、award、publication、patent、open_source、timeline、other。",
    "每个 Fact 必须至少引用一个 evidenceId，格式为 evidenceRefs: [{ evidenceId: \"...\" }]。",
    "可直接从原文得到的事实使用 derivationType=direct。",
    "基于证据推断的事实使用 derivationType=inferred，并填写 inferenceBasis。",
    "候选人自述的“精通、熟悉、了解”等词不能直接作为技能熟练度评分依据。",
    "年龄、性别、婚育、照片等敏感信息不要抽取进 candidateProfile 或 facts。",
    "不确定的信息不要猜测，放入 candidateProfile.unresolvedItems 或 warnings。",
    "不能确定的数组字段输出空数组，不要省略必填对象。",
  ].join("\n");
}

function buildUserPrompt(candidateId: string, createdAt: string, evidencePayload: string): string {
  return [
    `candidateId: ${candidateId}`,
    `createdAt/updatedAt: ${createdAt}`,
    "",
    "请根据以下 Evidence 文本块抽取简历信息。",
    "candidateProfile.id 必须等于 candidateId。",
    'candidateProfile.schemaVersion 必须是 "candidate-profile.v1"。',
    "candidateProfile.createdAt 和 updatedAt 必须使用上面的时间。",
    "Fact.createdAt 必须使用上面的时间。",
    "",
    "Evidence:",
    evidencePayload,
  ].join("\n");
}

function buildEvidencePayload(evidence: Evidence[], maxChars: number): string {
  const lines: string[] = [];
  let usedChars = 0;

  for (const item of evidence) {
    const block = [
      `evidenceId: ${item.id}`,
      `documentName: ${item.source.documentName}`,
      item.source.pageNumber ? `pageNumber: ${item.source.pageNumber}` : undefined,
      item.source.blockIndex !== undefined ? `blockIndex: ${item.source.blockIndex}` : undefined,
      "rawText:",
      item.rawText,
      "---",
    ]
      .filter(Boolean)
      .join("\n");

    if (usedChars + block.length > maxChars) {
      lines.push(`TRUNCATED: input exceeded MAX_LLM_INPUT_CHARS=${maxChars}`);
      break;
    }

    lines.push(block);
    usedChars += block.length;
  }

  return lines.join("\n");
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(sanitizeJsonControlCharacters(extractFirstJsonObject(withoutFence)));
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("LLM response does not contain a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("LLM response contains an incomplete JSON object.");
}

function sanitizeJsonControlCharacters(text: string): string {
  let sanitized = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      sanitized += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      sanitized += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      sanitized += char;
      inString = !inString;
      continue;
    }
    if (inString && char.charCodeAt(0) < 0x20) {
      sanitized += " ";
      continue;
    }

    sanitized += char;
  }

  return sanitized;
}
