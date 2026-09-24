import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractUsageMetadata, sanitizeTraceInputs, sanitizeTraceOutputs, withLlmTrace } from "../src/observability/langsmith.js";

const originalTracing = process.env.LANGSMITH_TRACING;
const originalApiKey = process.env.LANGSMITH_API_KEY;
const originalUsageFile = process.env.LLM_USAGE_FILE;
let testDirectory: string | undefined;

beforeEach(async () => {
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-langsmith-test-"));
  process.env.LLM_USAGE_FILE = path.join(testDirectory, "usage.jsonl");
});

afterEach(async () => {
  if (originalTracing === undefined) delete process.env.LANGSMITH_TRACING;
  else process.env.LANGSMITH_TRACING = originalTracing;
  if (originalApiKey === undefined) delete process.env.LANGSMITH_API_KEY;
  else process.env.LANGSMITH_API_KEY = originalApiKey;
  if (originalUsageFile === undefined) delete process.env.LLM_USAGE_FILE;
  else process.env.LLM_USAGE_FILE = originalUsageFile;
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  testDirectory = undefined;
  vi.restoreAllMocks();
});

describe("LangSmith tracing privacy", () => {
  it("keeps only approved metadata and aggregate outputs", () => {
    expect(sanitizeTraceInputs({
      operation: "resume_scoring",
      model: "test-model",
      candidateId: "private-candidate-id",
      prompt: "private resume and JD text",
    })).toEqual({ operation: "resume_scoring", model: "test-model" });

    expect(sanitizeTraceOutputs({
      status: "success",
      durationMs: 123,
      totalTokens: 456,
      score: 82,
      response: "private model response",
    })).toEqual({ status: "success", durationMs: 123, totalTokens: 456 });
  });

  it("normalizes provider token usage into LangSmith usage metadata", () => {
    expect(extractUsageMetadata({ input_tokens: 120, output_tokens: 30, total_tokens: 150 })).toEqual({
      input_tokens: 120,
      output_tokens: 30,
      total_tokens: 150,
    });
    expect(extractUsageMetadata({ prompt_tokens: 70, completion_tokens: 20 })).toEqual({
      input_tokens: 70,
      output_tokens: 20,
      total_tokens: 90,
    });
    expect(sanitizeTraceOutputs({ usage_metadata: { input_tokens: 120, output_tokens: 30, prompt: "private" } })).toEqual({
      usage_metadata: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
    });
  });

  it("runs normally without tracing when the feature is disabled", async () => {
    process.env.LANGSMITH_TRACING = "false";
    process.env.LANGSMITH_API_KEY = "";
    const privateModelResult = { output_text: "private response" };
    const modelCall = vi.fn().mockResolvedValue(privateModelResult);

    await expect(withLlmTrace({
      operation: "resume_scoring",
      provider: "test",
      model: "test-model",
    }, modelCall)).resolves.toBe(privateModelResult);
    expect(modelCall).toHaveBeenCalledOnce();
  });

  it("continues without tracing when tracing is enabled but no key is configured", async () => {
    process.env.LANGSMITH_TRACING = "true";
    delete process.env.LANGSMITH_API_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const modelCall = vi.fn().mockResolvedValue({ output_text: "ok" });

    await withLlmTrace({
      operation: "resume_extraction",
      provider: "test",
      model: "test-model",
    }, modelCall);
    expect(modelCall).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
