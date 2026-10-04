export type ModelProvider = "openai" | "deepseek" | "custom";

export type AvailableModel = {
  id: string;
  name?: string;
};

type FetchModelsOptions = {
  provider: ModelProvider;
  baseURL: string;
  apiKey?: string;
  fetcher?: typeof fetch;
};

export async function fetchAvailableModels({ provider, baseURL, apiKey, fetcher = fetch }: FetchModelsOptions): Promise<AvailableModel[]> {
  const key = apiKey?.trim() || process.env.LLM_API_KEY || (provider === "deepseek"
    ? process.env.DEEPSEEK_API_KEY
    : provider === "openai" ? process.env.OPENAI_API_KEY : undefined) || "";
  if (!key) throw new Error("请先填写或配置 API Key。");

  const endpoint = baseURL.trim() || (provider === "deepseek"
    ? "https://api.deepseek.com"
    : provider === "openai" ? "https://api.openai.com/v1" : "");
  if (!endpoint) throw new Error("自定义服务商需要填写接口地址。");

  let modelsUrl: URL;
  try {
    modelsUrl = new URL(endpoint);
  } catch {
    throw new Error("接口地址格式不正确。");
  }
  if (!["http:", "https:"].includes(modelsUrl.protocol) || modelsUrl.username || modelsUrl.password) {
    throw new Error("接口地址必须是有效的 HTTP 或 HTTPS 地址。");
  }
  modelsUrl.pathname = `${modelsUrl.pathname.replace(/\/+$/, "")}/models`;
  modelsUrl.search = "";
  modelsUrl.hash = "";

  let response: Response;
  try {
    response = await fetcher(modelsUrl, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("请求模型列表超时，请检查网络或接口地址。");
    throw new Error("无法连接模型服务，请检查网络和接口地址。");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("API Key 无效或没有访问模型列表的权限。");
    if (response.status === 404) throw new Error("服务商未提供兼容的 /models 接口；请手动填写模型名称。");
    throw new Error(`获取模型列表失败（HTTP ${response.status}）。`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("服务商返回的模型列表格式无法识别。");
  }
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("服务商返回的模型列表格式无法识别。");
  }

  const models = payload.data.flatMap((entry): AvailableModel[] => {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string" || !entry.id.trim()) return [];
    const name = "name" in entry && typeof entry.name === "string" ? entry.name : undefined;
    return [{ id: entry.id, ...(name ? { name } : {}) }];
  });
  if (models.length === 0) throw new Error("接口已连接，但没有返回可用模型。");
  return models.sort((left, right) => left.id.localeCompare(right.id));
}
