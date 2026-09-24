import { describe, expect, it } from "vitest";

import { collectUnknownSlugTerms } from "../src/features/slug-suggestions.js";
import { CandidateFeatureSetSchema } from "../src/schemas/index.js";

describe("slug suggestions", () => {
  it("collects unknown hash slug terms from feature display values", () => {
    const featureSet = CandidateFeatureSetSchema.parse({
      candidateId: "candidate-001",
      schemaVersion: "candidate-features.v1",
      features: [
        {
          key: "domain.zh_abc123.exists",
          group: "domain",
          label: "领域：智能制造与工业机器人",
          displayValue: "智能制造与工业机器人",
          value: true,
          valueType: "boolean",
          derivationNote: "测试",
          sourceFactIds: ["fact-001"],
          evidenceRefs: [{ evidenceId: "evidence-001" }],
        },
      ],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });

    expect(collectUnknownSlugTerms(featureSet)).toEqual([
      {
        term: "智能制造与工业机器人",
        currentHashSlug: "zh_abc123",
        sourceFeatureKey: "domain.zh_abc123.exists",
        category: "domain",
      },
    ]);
  });
});
