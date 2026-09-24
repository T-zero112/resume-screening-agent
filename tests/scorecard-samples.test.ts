import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ScorecardSchema } from "../src/schemas/index.js";

describe("sample scorecards", () => {
  it("validates the AI Agent intern scorecard", () => {
    const scorecard = ScorecardSchema.parse(
      JSON.parse(readFileSync("samples/scorecards/ai-agent-intern.scorecard.json", "utf8")),
    );

    expect(scorecard.title).toBe("AI Agent 开发实习生评分表");
    expect(scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(1);
  });
});
