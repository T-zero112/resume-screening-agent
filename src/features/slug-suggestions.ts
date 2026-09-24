import OpenAI from "openai";
import { z } from "zod";

import type { CandidateFeatureSet } from "../schemas/index.js";
import { resolveLlmConfig } from "../extraction/llm-config.js";
import { withLlmTrace } from "../observability/langsmith.js";

export const SlugSuggestionSchema = z.object({
  term: z.string().min(1),
  currentHashSlug: z.string().min(1),
  sourceFeatureKey: z.string().min(1),
  category: z.string().min(1),
  suggestedSlug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  status: z.enum(["suggested", "invalid"]).default("suggested"),
});
export type SlugSuggestion = z.infer<typeof SlugSuggestionSchema>;

const SlugSuggestionResponseSchema = z.object({
  suggestions: z.array(SlugSuggestionSchema.pick({ term: true, suggestedSlug: true })),
});

const responseJsonSchema = z.toJSONSchema(SlugSuggestionResponseSchema);

export function collectUnknownSlugTerms(featureSet: CandidateFeatureSet): Array<{
  term: string;
  currentHashSlug: string;
  sourceFeatureKey: string;
  category: string;
}> {
  const unknownTerms = new Map<string, {
    term: string;
    currentHashSlug: string;
    sourceFeatureKey: string;
    category: string;
  }>();

  for (const feature of featureSet.features) {
    const hashPart = feature.key.split(".").find((part) => /^zh_[a-z0-9]+$/.test(part));
    const term = feature.displayValue;

    if (!hashPart || !term) {
      continue;
    }

    unknownTerms.set(term, {
      term,
      currentHashSlug: hashPart,
      sourceFeatureKey: feature.key,
      category: feature.group,
    });
  }

  return [...unknownTerms.values()];
}

export async function suggestSlugsWithLlm(featureSet: CandidateFeatureSet): Promise<SlugSuggestion[]> {
  const unknownTerms = collectUnknownSlugTerms(featureSet);

  if (unknownTerms.length === 0) {
    return [];
  }

  const llmConfig = resolveLlmConfig();
  const client = new OpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseURL,
  });

  const response = await withLlmTrace({
    operation: "slug_suggestion",
    provider: llmConfig.provider,
    model: llmConfig.model,
    baseURL: llmConfig.baseURL,
    taskCount: unknownTerms.length,
  }, () => client.responses.create({
    model: llmConfig.model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "你是 slug 标准化助手。",
              "请把中文招聘/简历术语转换为稳定英文 slug。",
              "只输出 JSON。",
              "slug 只能使用小写英文字母、数字、下划线；不能使用连字符、空格、中文。",
              "slug 应短而清晰，避免过度意译。",
              "同一术语应保持一致。",
            ].join("\n"),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({ terms: unknownTerms }, null, 2),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "slug_suggestions",
        strict: false,
        schema: responseJsonSchema,
      },
    },
  }));

  const parsed = SlugSuggestionResponseSchema.parse(JSON.parse(response.output_text));
  const suggestionByTerm = new Map(parsed.suggestions.map((suggestion) => [suggestion.term, suggestion.suggestedSlug]));

  return unknownTerms.map((term) =>
    SlugSuggestionSchema.parse({
      ...term,
      suggestedSlug: suggestionByTerm.get(term.term) ?? term.currentHashSlug,
      status: suggestionByTerm.has(term.term) ? "suggested" : "invalid",
    }),
  );
}
