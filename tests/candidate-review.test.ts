import { describe, expect, it } from "vitest";

import { buildCandidateReview } from "../src/review/candidate-review.js";
import { EvaluationResultSchema } from "../src/schemas/index.js";

const now = "2026-09-20T00:00:00.000Z";

describe("candidate review", () => {
  it("builds a review-focused result without recommendation status", () => {
    const evaluation = EvaluationResultSchema.parse({
      schemaVersion: "evaluation-result.v1",
      candidateId: "candidate-001",
      scorecardId: "scorecard-001",
      jobId: "job-001",
      hardRequirementStatus: "pass",
      totalScore: 80,
      requirementEvaluations: [
        {
          requirementId: "req-python",
          description: "Python",
          featureKey: "skill.python.exists",
          status: "matched",
          evidenceRefs: [{ evidenceId: "evidence-001", quote: "Python" }],
          explanation: "匹配。",
        },
        {
          requirementId: "req-vue",
          description: "Vue",
          featureKey: "skill.vue.exists",
          status: "needs_review",
          evidenceRefs: [],
          explanation: "未找到 Feature。",
        },
      ],
      dimensions: [
        {
          dimensionId: "dim-001",
          name: "技能",
          weight: 1,
          score: 80,
          weightedScore: 80,
          rules: [],
        },
      ],
      reviewFlags: [{ id: "flag-001", description: "人工复核" }],
      generatedAt: now,
    });

    const review = buildCandidateReview(evaluation, now);

    expect(review.totalScore).toBe(80);
    expect(review.matchedItems[0]?.evidenceQuotes).toEqual(["Python"]);
    expect(review.reviewItems[0]?.requirementId).toBe("req-vue");
    expect("recommendationStatus" in review).toBe(false);
  });
});
