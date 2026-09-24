export type LlmProvider = "openai" | "deepseek" | "custom";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
};

export function resolveLlmConfig(modelOverride?: string): LlmConfig {
  const provider = resolveProvider();
  const apiKey = resolveApiKey(provider);
  const baseURL = resolveBaseUrl(provider);
  const model = modelOverride ?? resolveModel(provider);

  return {
    provider,
    apiKey,
    baseURL,
    model,
  };
}

function resolveProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER ?? inferProvider()).toLowerCase();

  if (provider === "openai" || provider === "deepseek" || provider === "custom") {
    return provider;
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}. Supported: openai, deepseek, custom.`);
}

function inferProvider(): LlmProvider {
  if (process.env.DEEPSEEK_API_KEY) {
    return "deepseek";
  }

  if (process.env.LLM_BASE_URL) {
    return "custom";
  }

  return "openai";
}

function resolveApiKey(provider: LlmProvider): string {
  const apiKey =
    process.env.LLM_API_KEY ??
    (provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : undefined) ??
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "LLM API key is required. Set LLM_API_KEY, or provider-specific DEEPSEEK_API_KEY / OPENAI_API_KEY.",
    );
  }

  return apiKey;
}

function resolveBaseUrl(provider: LlmProvider): string | undefined {
  if (process.env.LLM_BASE_URL) {
    return process.env.LLM_BASE_URL;
  }

  if (provider === "deepseek") {
    return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  }

  return process.env.OPENAI_BASE_URL;
}

function resolveModel(provider: LlmProvider): string {
  if (process.env.LLM_MODEL) {
    return process.env.LLM_MODEL;
  }

  if (provider === "deepseek") {
    return process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  }

  return process.env.OPENAI_MODEL ?? "gpt-6-astra";
}
