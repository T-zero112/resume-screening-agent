import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: vi.fn().mockImplementation(() => ({ responses: { create } })) }));

const originalDirectory = process.cwd();
const originalEnvironment = Object.fromEntries([
  "LLM_PROVIDER", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LANGSMITH_TRACING", "LANGSMITH_API_KEY",
].map((key) => [key, process.env[key]]));

afterEach(() => {
  process.chdir(originalDirectory);
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  create.mockReset();
  vi.resetModules();
});

it("generates JD-grounded guidance and records the call without tracing prompt content", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "dimension-guidance-test-"));
  process.chdir(temporaryDirectory);
  process.env.LLM_PROVIDER = "custom";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_BASE_URL = "https://llm.example.test/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LANGSMITH_TRACING = "false";
  delete process.env.LANGSMITH_API_KEY;
  vi.resetModules();
  create.mockResolvedValue({
    output_text: JSON.stringify({
      description: "评估候选人与岗位要求相关的项目经验。",
      highScoreGuidance: "有独立负责的相关项目并能说明成果。",
      lowScoreGuidance: "缺少相关项目证据，或职责与岗位关联较弱。",
    }),
    usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
  });
  try {
    const { generateDimensionGuidance } = await import("../src/jobs/dimension-guidance-generator.js");
    const result = await generateDimensionGuidance({ jdText: "负责相关项目实施与客户协调。", dimensionName: "项目经验" });

    expect(result.highScoreGuidance).toContain("独立负责");
    expect(create).toHaveBeenCalledOnce();
    const request = create.mock.calls[0]![0] as { input: Array<{ content: Array<{ text: string }> }> };
    expect(request.input[1]!.content[0]!.text).toContain("项目经验");
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
