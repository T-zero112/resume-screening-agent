import { describe, expect, it } from "vitest";

import { buildScoreTrace } from "../src/scoring/llm-jd-scorer.js";

const now = "2026-09-22T00:00:00.000Z";

describe("LLM JD scorer", () => {
  it("builds a capped score trace", () => {
    const trace = buildScoreTrace({
      candidateId: "candidate-001",
      jobId: "job-regional-sales",
      scorecardId: "llm-score-regional-sales-v1",
      generatedAt: now,
      llmConfig: {
        provider: "custom",
        apiKey: "test",
        model: "test-model",
      },
      parsed: {
        role_summary: "区域销售",
        core_duties: { evidence: "销售证据不足。", score: 20 },
        transferable_evidence: { evidence: "有客户维护经验。", score: 18 },
        hard_requirements: { evidence: "学历满足。", score: 12 },
        tools_industry: { evidence: "行业不完全一致。", score: 6 },
        practical_fit: { evidence: "地点待确认。", score: 8 },
        caps: ["sales_acquisition_core"],
        hard_gaps: ["未体现驾驶证"],
        reason: "有相邻销售证据，但核心获客证据不足。",
        missing: "驾驶证",
      },
    });

    expect(trace.rawScore).toBe(64);
    expect(trace.finalScore).toBe(64);
    expect(trace.components).toHaveLength(5);
  });

  it("applies cap limits", () => {
    const trace = buildScoreTrace({
      candidateId: "candidate-001",
      jobId: "job-regional-sales",
      scorecardId: "llm-score-regional-sales-v1",
      generatedAt: now,
      llmConfig: {
        provider: "custom",
        apiKey: "test",
        model: "test-model",
      },
      parsed: {
        role_summary: "区域销售",
        core_duties: { evidence: "职责部分相关。", score: 35 },
        transferable_evidence: { evidence: "迁移证据强。", score: 24 },
        hard_requirements: { evidence: "硬要求部分待确认。", score: 14 },
        tools_industry: { evidence: "行业相关。", score: 9 },
        practical_fit: { evidence: "实际条件匹配。", score: 10 },
        caps: ["sales_acquisition_core"],
        hard_gaps: [],
        reason: "高分但触发封顶。",
        missing: "",
      },
    });

    expect(trace.rawScore).toBe(92);
    expect(trace.finalScore).toBe(65);
  });
});
