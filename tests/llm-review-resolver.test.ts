import { describe, expect, it } from "vitest";

import { parseReviewResolutionInputs } from "../src/review/llm-review-resolver.js";
import { resolveReviewTasksWithLlm } from "../src/review/llm-review-resolver.js";

const now = "2026-09-21T00:00:00.000Z";

describe("LLM review resolver helpers", () => {
  it("validates resolver inputs", () => {
    const parsed = parseReviewResolutionInputs(
      {
        schemaVersion: "review-tasks.v1",
        candidateId: "candidate-001",
        sourceFilePath: "resume.pdf",
        tasks: [
          {
            id: "review-task-001",
            type: "timeline_conflict",
            severity: "high",
            question: "日期区间归属不明。",
            source: "llm_warning",
            resolutionMode: "llm_candidate",
          },
        ],
        generatedAt: now,
      },
      [
        {
          id: "evidence-001",
          source: {
            documentId: "doc-001",
            documentName: "resume.pdf",
            documentType: "pdf",
          },
          rawText: "2019.01-2020.01 某公司 销售",
          createdAt: now,
        },
      ],
    );

    expect(parsed.reviewTaskSet.tasks[0]?.status).toBe("open");
    expect(parsed.evidence[0]?.granularity).toBe("block");
  });

  it("returns an empty result when no concrete LLM candidate tasks exist", async () => {
    const result = await resolveReviewTasksWithLlm({
      reviewTaskSet: {
        schemaVersion: "review-tasks.v1",
        candidateId: "candidate-001",
        sourceFilePath: "resume.pdf",
        tasks: [
          {
            id: "review-task-001",
            type: "parse_quality",
            severity: "medium",
            question: "LLM 返回了警告。",
            source: "parse_quality",
            resolutionMode: "llm_candidate",
            status: "open",
            evidenceRefs: [],
          },
        ],
        generatedAt: now,
      },
      evidence: [],
      generatedAt: now,
    });

    expect(result.resolutions).toEqual([]);
    expect(result.skippedTaskIds).toEqual(["review-task-001"]);
  });
});
