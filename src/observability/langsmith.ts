import { Client } from "langsmith/client";
import { traceable } from "langsmith/traceable";
import { estimateTokenCost, extractTokenUsage, recordLlmUsage } from "./llm-usage.js";

export type LlmTraceOperation =
  | "resume_extraction"
  | "resume_scoring"
  | "score_standard_generation"
  | "dimension_guidance_generation"
  | "review_resolution"
  | "slug_suggestion"
  | "pdf_vision_ocr";

export type LlmTraceContext = {
  operation: LlmTraceOperation;
  provider: string;
  model: string;
  baseURL?: string;
  evidenceCount?: number;
  inputCharacters?: number;
  standardVersion?: number;
  dimensionCount?: number;
  taskCount?: number;
};

type ResponseSummary = {
  output_text?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  } | null;
};

type TraceUsageMetadata = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: { cache_read: number };
  input_cost?: number;
  output_cost?: number;
  total_cost?: number;
};

const allowedTraceInputKeys = new Set([
  "operation",
  "provider",
  "model",
  "evidenceCount",
  "inputCharacters",
  "standardVersion",
  "dimensionCount",
  "taskCount",
  "ls_provider",
  "ls_model_name",
]);
const allowedTraceOutputKeys = new Set([
  "status",
  "durationMs",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "responseCharacters",
  "errorType",
  "httpStatus",
  "usage_metadata",
]);

let langSmithClient: Client | undefined;
let langSmithClientConfig = "";
let missingKeyWarningShown = false;

export async function withLlmTrace<T>(context: LlmTraceContext, call: () => Promise<T>): Promise<T> {
  const tracingEnabled = process.env.LANGSMITH_TRACING?.toLowerCase() === "true";
  if (tracingEnabled && !process.env.LANGSMITH_API_KEY) {
    if (!missingKeyWarningShown) {
      console.warn("LangSmith tracing is enabled but LANGSMITH_API_KEY is missing; continuing without traces.");
      missingKeyWarningShown = true;
    }
  }

  const safeContext = sanitizeContext(context);
  let result: T;
  let callError: unknown;
  let callStarted = false;
  let startedAt = new Date();

  const invokeAndRecord = async () => {
    startedAt = new Date();
    const startedAtMs = Date.now();
    try {
      result = await call();
      await persistUsage({ context, response: result, status: "success", startedAt, durationMs: Date.now() - startedAtMs });
      return result;
    } catch (error) {
      await persistUsage({ context, status: "failed", startedAt, durationMs: Date.now() - startedAtMs });
      throw error;
    }
  };

  if (!tracingEnabled || !process.env.LANGSMITH_API_KEY) return invokeAndRecord();

  const tracedCall = traceable(async () => {
    callStarted = true;
    const traceStartedAt = Date.now();
    try {
      await invokeAndRecord();
      return {
        status: "success",
        durationMs: Date.now() - traceStartedAt,
        ...summarizeResponse(result, context, startedAt),
      };
    } catch (error) {
      callError = error;
      return {
        status: "error",
        durationMs: Date.now() - traceStartedAt,
        errorType: safeErrorType(error),
        httpStatus: safeHttpStatus(error),
      };
    }
  }, {
    name: `resume-screening.${safeContext.operation}`,
    run_type: "llm",
    project_name: process.env.LANGSMITH_PROJECT || "resume-screening",
    metadata: safeContext,
    client: getLangSmithClient(),
  });

  try {
    await tracedCall(safeContext);
  } catch {
    if (!callStarted) {
      console.warn("LangSmith tracing failed before the model call; continuing without tracing.");
      return invokeAndRecord();
    }
  }

  if (callError !== undefined) {
    throw callError;
  }
  return result!;
}

async function persistUsage(input: Parameters<typeof recordLlmUsage>[0]): Promise<void> {
  try {
    await recordLlmUsage(input);
  } catch {
    console.warn("Local LLM usage could not be recorded; model processing is unaffected.");
  }
}

export async function flushLangSmithTraces(): Promise<boolean> {
  if (process.env.LANGSMITH_TRACING?.toLowerCase() !== "true" || !process.env.LANGSMITH_API_KEY || !langSmithClient) {
    return false;
  }
  try {
    await langSmithClient.flush();
    return true;
  } catch {
    console.warn("LangSmith trace upload could not be confirmed; application data processing is unaffected.");
    return false;
  }
}

export function sanitizeTraceInputs(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => allowedTraceInputKeys.has(key)));
}

export function sanitizeTraceOutputs(values: Record<string, unknown>): Record<string, unknown> {
  const output = Object.fromEntries(Object.entries(values).filter(([key]) => allowedTraceOutputKeys.has(key) && key !== "usage_metadata"));
  const usage = normalizeTraceUsage(values.usage_metadata);
  if (usage) output.usage_metadata = usage;
  return output;
}

function getLangSmithClient(): Client {
  const config = JSON.stringify([process.env.LANGSMITH_API_KEY, process.env.LANGSMITH_ENDPOINT]);
  if (langSmithClient && langSmithClientConfig !== config) {
    const previousClient = langSmithClient;
    void previousClient.flush().catch(() => undefined);
    langSmithClient = undefined;
  }
  if (!langSmithClient) {
    langSmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
      apiUrl: process.env.LANGSMITH_ENDPOINT,
      hideInputs: sanitizeTraceInputs,
      hideOutputs: sanitizeTraceOutputs,
      hideMetadata: sanitizeTraceInputs,
      omitTracedRuntimeInfo: true,
    });
    langSmithClientConfig = config;
  }
  return langSmithClient;
}

function sanitizeContext(context: LlmTraceContext): Record<string, string | number> {
  const provider = safeIdentifier(context.provider, "custom");
  const model = safeIdentifier(context.model, "custom");
  return sanitizeTraceInputs({
    operation: context.operation,
    provider,
    model,
    ls_provider: provider,
    ls_model_name: model,
    evidenceCount: safeCount(context.evidenceCount),
    inputCharacters: safeCount(context.inputCharacters),
    standardVersion: safeCount(context.standardVersion),
    dimensionCount: safeCount(context.dimensionCount),
    taskCount: safeCount(context.taskCount),
  }) as Record<string, string | number>;
}

function summarizeResponse(value: unknown, context: LlmTraceContext, timestamp: Date): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const response = value as ResponseSummary;
  const usage = extractTokenUsage(response);
  const cost = usage ? estimateTokenCost({ ...context, baseURL: context.baseURL }, usage, timestamp) : {};
  const usageMetadata = usage ? {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    ...(usage.cachedInputTokens !== undefined ? { input_token_details: { cache_read: usage.cachedInputTokens } } : {}),
    ...(cost.inputCostUsd !== undefined ? { input_cost: cost.inputCostUsd } : {}),
    ...(cost.outputCostUsd !== undefined ? { output_cost: cost.outputCostUsd } : {}),
    ...(cost.costUsd !== undefined ? { total_cost: cost.costUsd } : {}),
  } : undefined;
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    usage_metadata: usageMetadata,
    responseCharacters: typeof response.output_text === "string" ? response.output_text.length : undefined,
  };
}

export function extractUsageMetadata(value: ResponseSummary["usage"]): TraceUsageMetadata | undefined {
  if (!value) return undefined;
  const usage = extractTokenUsage({ usage: value });
  if (!usage) return undefined;
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    ...(usage.cachedInputTokens !== undefined ? { input_token_details: { cache_read: usage.cachedInputTokens } } : {}),
  };
}

function normalizeTraceUsage(value: unknown): TraceUsageMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const normalized = extractUsageMetadata({
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
  });
  if (!normalized) return undefined;
  const details = usage.input_token_details;
  const cachedTokens = details && typeof details === "object" && !Array.isArray(details)
    ? safeCount((details as Record<string, unknown>).cache_read)
    : undefined;
  const inputCost = isSafeCost(usage.input_cost);
  const outputCost = isSafeCost(usage.output_cost);
  const totalCost = isSafeCost(usage.total_cost);
  return {
    ...normalized,
    ...(cachedTokens !== undefined ? { input_token_details: { cache_read: cachedTokens } } : {}),
    ...(inputCost !== undefined ? { input_cost: inputCost } : {}),
    ...(outputCost !== undefined ? { output_cost: outputCost } : {}),
    ...(totalCost !== undefined ? { total_cost: totalCost } : {}),
  };
}

function isSafeCost(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeErrorType(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "Error";
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ? name : "Error";
}

function safeHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }
  return safeCount(error.status);
}

function safeIdentifier(value: string, fallback: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value) ? value : fallback;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
