import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAvailableModels } from "../src/jobs/model-discovery.js";

describe("model discovery", () => {
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it("loads and sorts model ids from an OpenAI-compatible models endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "z-model" }, { id: "a-model", name: "Alpha" }, { invalid: true }],
    }), { status: 200 }));

    await expect(fetchAvailableModels({
      provider: "deepseek",
      baseURL: "https://api.deepseek.com/v1/",
      apiKey: "secret",
      fetcher,
    })).resolves.toEqual([{ id: "a-model", name: "Alpha" }, { id: "z-model" }]);

    expect(fetcher).toHaveBeenCalledWith(new URL("https://api.deepseek.com/v1/models"), expect.objectContaining({
      headers: { Authorization: "Bearer secret", Accept: "application/json" },
    }));
  });

  it("uses a configured provider key when no new key is entered", async () => {
    process.env.DEEPSEEK_API_KEY = "saved-key";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "deepseek-flash" }] }), { status: 200 }));

    await fetchAvailableModels({ provider: "deepseek", baseURL: "", fetcher });

    expect(fetcher).toHaveBeenCalledWith(new URL("https://api.deepseek.com/models"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer saved-key" }),
    }));
  });

  it("reports authentication errors without exposing credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(fetchAvailableModels({ provider: "openai", baseURL: "", apiKey: "secret", fetcher }))
      .rejects.toThrow("API Key 无效或没有访问模型列表的权限。");
  });

  it("requires an endpoint for custom providers", async () => {
    await expect(fetchAvailableModels({ provider: "custom", baseURL: "", apiKey: "secret" }))
      .rejects.toThrow("自定义服务商需要填写接口地址。");
  });
});
