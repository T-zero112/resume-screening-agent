import { describe, expect, it } from "vitest";

import { evaluateCandidate } from "../src/scoring/score-engine.js";
import { CandidateFeatureSetSchema, ScorecardSchema } from "../src/schemas/index.js";

const now = "2026-09-20T00:00:00.000Z";

describe("score engine", () => {
  it("evaluates hard requirements and weighted dimensions", () => {
    const featureSet = CandidateFeatureSetSchema.parse({
      candidateId: "candidate-001",
      schemaVersion: "candidate-features.v1",
      features: [
        {
          key: "skill.python.exists",
          group: "skill",
          value: true,
          valueType: "boolean",
          derivationNote: "测试",
          sourceFactIds: ["fact-001"],
          evidenceRefs: [{ evidenceId: "evidence-001" }],
        },
        {
          key: "education.highest_degree",
          group: "education",
          value: "本科",
          valueType: "string",
          derivationNote: "测试",
          sourceFactIds: ["fact-002"],
          evidenceRefs: [{ evidenceId: "evidence-001" }],
        },
      ],
      generatedAt: now,
    });
    const scorecard = ScorecardSchema.parse({
      id: "scorecard-001",
      schemaVersion: "scorecard.v1",
      jobId: "job-001",
      version: 1,
      title: "测试评分表",
      requirements: [
        {
          id: "req-degree",
          type: "education",
          description: "本科及以上",
          condition: {
            featureKey: "education.highest_degree",
            operator: "includes",
            expectedValue: ["本科", "硕士"],
          },
          isHardRequirement: true,
        },
        {
          id: "req-python",
          type: "skill",
          description: "Python",
          condition: {
            featureKey: "skill.python.exists",
            operator: "eq",
            expectedValue: true,
          },
        },
      ],
      dimensions: [
        {
          id: "dim-skill",
          name: "技能",
          weight: 1,
          scoringRules: [
            {
              id: "rule-python",
              requirementId: "req-python",
              description: "Python",
              maxPoints: 100,
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const result = evaluateCandidate(featureSet, scorecard);

    expect(result.hardRequirementStatus).toBe("pass");
    expect(result.totalScore).toBe(100);
  });
});
