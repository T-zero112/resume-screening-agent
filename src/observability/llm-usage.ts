import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export type UsageContext = {
  operation: string;
  provider: string;
  model: string;
  baseURL?: string;
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
};

export const LlmUsageRecordSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  operation: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(["success", "failed"]),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  pricingSource: z.string().optional(),
  pricingPeriod: z.enum(["peak", "off_peak"]).optional(),
});

export type LlmUsageRecord = z.infer<typeof LlmUsageRecordSchema>;

const usageFile = () => process.env.LLM_USAGE_FILE ?? path.resolve("data/usage/llm-usage.jsonl");
let cachedUsdCnyRate: { date: string; rate: number; fetchedAt: number } | undefined;

export async function getUsdCnyRate(): Promise<{ date: string; rate: number; source: string } | undefined> {
  if (cachedUsdCnyRate && Date.now() - cachedUsdCnyRate.fetchedAt < 12 * 60 * 60 * 1000) {
    return { date: cachedUsdCnyRate.date, rate: cachedUsdCnyRate.rate, source: "Frankfurter 每日参考汇率" };
  }
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/usd/cny", { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`Exchange rate request failed: ${response.status}`);
    const result = z.object({ date: z.string(), rate: z.number().positive() }).parse(await response.json());
    cachedUsdCnyRate = { ...result, fetchedAt: Date.now() };
    return { ...result, source: "Frankfurter 每日参考汇率" };
  } catch {
    if (cachedUsdCnyRate) {
      return { date: cachedUsdCnyRate.date, rate: cachedUsdCnyRate.rate, source: "Frankfurter 缓存汇率（网络暂不可用）" };
    }
    return undefined;
  }
}

export function extractTokenUsage(response: unknown): TokenUsage | undefined {
  if (!response || typeof response !== "object" || !("usage" in response)) return undefined;
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const values = usage as Record<string, unknown>;
  const inputTokens = safeCount(values.input_tokens ?? values.prompt_tokens);
  const outputTokens = safeCount(values.output_tokens ?? values.completion_tokens);
  const totalTokens = safeCount(values.total_tokens) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
  const details = values.input_tokens_details;
  const cachedInputTokens = details && typeof details === "object"
    ? safeCount((details as Record<string, unknown>).cached_tokens)
    : undefined;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens, cachedInputTokens };
}

export function estimateTokenCost(context: UsageContext, usage: TokenUsage, timestamp: Date): { costUsd?: number; inputCostUsd?: number; outputCostUsd?: number; source?: string; period?: "peak" | "off_peak" } {
  if (context.provider !== "deepseek") return {};
  try {
    if (!context.baseURL || new URL(context.baseURL).origin !== "https://api.deepseek.com") return {};
  } catch {
    return {};
  }
  const model = context.model.toLowerCase();
  const rates = model === "deepseek-flash" || model === "deepseek-v4-flash"
    ? { cache: { peak: 0.006, off_peak: 0.003 }, input: { peak: 0.3, off_peak: 0.15 }, output: { peak: 1.2, off_peak: 0.6 } }
    : model === "deepseek-v4-pro"
      ? { cache: { peak: 0.044, off_peak: 0.022 }, input: { peak: 1.32, off_peak: 0.66 }, output: { peak: 3.96, off_peak: 1.98 } }
      : undefined;
  if (!rates || usage.inputTokens === undefined || usage.outputTokens === undefined) return {};

  const period = isDeepSeekPeak(timestamp) ? "peak" : "off_peak";
  const cachedTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const uncachedTokens = usage.inputTokens - cachedTokens;
  const inputCost = (cachedTokens * rates.cache[period] + uncachedTokens * rates.input[period]) / 1_000_000;
  const outputCost = usage.outputTokens * rates.output[period] / 1_000_000;
  return { costUsd: inputCost + outputCost, inputCostUsd: inputCost, outputCostUsd: outputCost, source: "DeepSeek 官方定价（2026-08-16 起；按请求时段估算）", period };
}

export async function recordLlmUsage(input: {
  context: UsageContext;
  response?: unknown;
  status: "success" | "failed";
  startedAt: Date;
  durationMs: number;
}): Promise<LlmUsageRecord> {
  const usage = input.response ? extractTokenUsage(input.response) : undefined;
  const cost = usage ? estimateTokenCost(input.context, usage, input.startedAt) : {};
  const record = LlmUsageRecordSchema.parse({
    id: randomUUID(),
    timestamp: input.startedAt.toISOString(),
    durationMs: input.durationMs,
    operation: input.context.operation,
    provider: input.context.provider,
    model: input.context.model,
    status: input.status,
    ...usage,
    estimatedCostUsd: cost.costUsd,
    pricingSource: cost.source,
    pricingPeriod: cost.period,
  });
  const file = usageFile();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function getLlmUsageStats(period: "7d" | "30d" | "all"): Promise<{
  period: "7d" | "30d" | "all";
  callCount: number;
  successfulCalls: number;
  failedCalls: number;
  pricedCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byOperation: Array<{ operation: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>;
  byDay: Array<{ date: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>;
  records: LlmUsageRecord[];
}> {
  const file = usageFile();
  const contents = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
  const cutoff = period === "all" ? 0 : Date.now() - (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
  const records = contents.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const record = LlmUsageRecordSchema.parse(JSON.parse(line));
      return new Date(record.timestamp).getTime() >= cutoff ? [record] : [];
    } catch {
      return [];
    }
  }).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const byOperation = new Map<string, { operation: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>();
  const byDay = new Map<string, { date: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>();
  for (const record of records) {
    const tokens = record.totalTokens ?? (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
    const cost = record.estimatedCostUsd ?? 0;
    const operation = byOperation.get(record.operation) ?? { operation: record.operation, calls: 0, tokens: 0, pricedCalls: 0, estimatedCostUsd: 0 };
    operation.calls += 1;
    operation.tokens += tokens;
    operation.estimatedCostUsd += cost;
    operation.pricedCalls += record.estimatedCostUsd === undefined ? 0 : 1;
    byOperation.set(record.operation, operation);
    const date = record.timestamp.slice(0, 10);
    const daily = byDay.get(date) ?? { date, calls: 0, tokens: 0, pricedCalls: 0, estimatedCostUsd: 0 };
    daily.calls += 1;
    daily.tokens += tokens;
    daily.estimatedCostUsd += cost;
    daily.pricedCalls += record.estimatedCostUsd === undefined ? 0 : 1;
    byDay.set(date, daily);
  }
  const pricedCalls = records.filter((record) => record.estimatedCostUsd !== undefined).length;
  return {
    period,
    callCount: records.length,
    successfulCalls: records.filter((record) => record.status === "success").length,
    failedCalls: records.filter((record) => record.status === "failed").length,
    pricedCalls,
    unpricedCalls: records.length - pricedCalls,
    inputTokens: records.reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
    outputTokens: records.reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
    totalTokens: records.reduce((sum, record) => sum + (record.totalTokens ?? (record.inputTokens ?? 0) + (record.outputTokens ?? 0)), 0),
    estimatedCostUsd: records.reduce((sum, record) => sum + (record.estimatedCostUsd ?? 0), 0),
    byOperation: [...byOperation.values()].sort((left, right) => right.tokens - left.tokens),
    byDay: [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date)),
    records: records.slice(0, 250),
  };
}

function isDeepSeekPeak(date: Date): boolean {
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
