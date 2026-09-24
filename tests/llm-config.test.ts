import { afterEach, describe, expect, it } from "vitest";

import { resolveLlmConfig } from "../src/extraction/llm-config.js";

const ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
];

describe("LLM config", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("resolves DeepSeek from generic LLM settings", () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_BASE_URL = "https://api.deepseek.com";
    process.env.LLM_MODEL = "deepseek-flash";

    expect(resolveLlmConfig()).toEqual({
      provider: "deepseek",
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-flash",
    });
  });

  it("infers DeepSeek from DEEPSEEK_API_KEY", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";

    expect(resolveLlmConfig()).toEqual({
      provider: "deepseek",
      apiKey: "test-key",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-flash",
    });
  });

  it("keeps backwards-compatible OpenAI settings", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-6-astra";

    expect(resolveLlmConfig()).toEqual({
      provider: "openai",
      apiKey: "test-key",
      baseURL: undefined,
      model: "gpt-6-astra",
    });
  });
});
