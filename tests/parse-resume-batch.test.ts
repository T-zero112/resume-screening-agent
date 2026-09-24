import { describe, expect, it } from "vitest";

import { toCsv } from "../src/pipeline/parse-resume-batch.js";

describe("batch resume parsing helpers", () => {
  it("escapes csv cells", () => {
    const csv = toCsv([
      {
        sourceFilePath: "C:\\resume,one.pdf",
        status: "failed",
        errorMessage: 'Bad "PDF" text',
      },
    ]);

    expect(csv).toContain('"C:\\resume,one.pdf"');
    expect(csv).toContain('"Bad ""PDF"" text"');
  });
});
