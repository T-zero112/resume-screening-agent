import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { estimateTokenCost, extractTokenUsage, getLlmUsageStats, recordLlmUsage } from "../src/observability/llm-usage.js";

const originalUsageFile = process.env.LLM_USAGE_FILE;
let testDirectory: string | undefined;

afterEach(async () => {
  if (originalUsageFile === undefined) delete process.env.LLM_USAGE_FILE;
  else process.env.LLM_USAGE_FILE = originalUsageFile;
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  testDirectory = undefined;
});

describe("LLM usage tracking", () => {
  it("normalizes Responses API usage, including cached input tokens", () => {
    expect(extractTokenUsage({ usage: {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      input_tokens_details: { cached_tokens: 100_000 },
    } })).toEqual({
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      totalTokens: 1_100_000,
      cachedInputTokens: 100_000,
    });
  });

  it("estimates official DeepSeek Flash rates for peak and off-peak request times", () => {
    const context = { operation: "resume_scoring", provider: "deepseek", model: "deepseek-flash", baseURL: "https://api.deepseek.com/v1" };
    const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 100_000 };
    expect(estimateTokenCost(context, usage, new Date("2026-09-21T02:00:00Z"))).toMatchObject({ costUsd: 0.3906, period: "peak" });
    expect(estimateTokenCost(context, usage, new Date("2026-09-21T12:00:00Z"))).toMatchObject({ costUsd: 0.1953, period: "off_peak" });
  });

  it("does not apply DeepSeek rates to other providers or custom gateways", () => {
    const usage = { inputTokens: 100, outputTokens: 100 };
    const deepseek = { operation: "resume_scoring", provider: "deepseek", model: "deepseek-flash", baseURL: "https://api.deepseek.com" };
    expect(estimateTokenCost({ ...deepseek, baseURL: "https://gateway.example/v1" }, usage, new Date())).toEqual({});
    expect(estimateTokenCost({ ...deepseek, provider: "openai" }, usage, new Date())).toEqual({});
  });

  it("persists per-call usage locally and aggregates calls without calling unpriced models free", async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-usage-"));
    process.env.LLM_USAGE_FILE = path.join(testDirectory, "usage.jsonl");
    const timestamp = new Date();
    await recordLlmUsage({
      context: { operation: "resume_scoring", provider: "custom", model: "test-model" },
      response: { usage: { input_tokens: 12, output_tokens: 8 } },
      status: "success",
      startedAt: timestamp,
      durationMs: 42,
    });
    const stats = await getLlmUsageStats("all");
    expect(stats).toMatchObject({ callCount: 1, successfulCalls: 1, inputTokens: 12, outputTokens: 8, pricedCalls: 0, unpricedCalls: 1 });
    expect(stats.byOperation[0]).toMatchObject({ operation: "resume_scoring", calls: 1, tokens: 20, pricedCalls: 0, estimatedCostUsd: 0 });
    expect((await readFile(process.env.LLM_USAGE_FILE, "utf8")).trim()).toContain('"model":"test-model"');
  });
});
