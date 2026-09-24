import { describe, expect, it } from "vitest";

import { extractSourceMetadata } from "../src/parsing/source-metadata.js";

describe("source metadata extraction", () => {
  it("extracts filename clues without treating them as resume facts", () => {
    const metadata = extractSourceMetadata("C:/resumes/【业务员_珠海 4-5K】王静 10年以上.pdf");

    expect(metadata).toMatchObject({
      source: "filename",
      rawFileName: "【业务员_珠海 4-5K】王静 10年以上.pdf",
      inferredTitle: "业务员",
      inferredLocation: "珠海",
      inferredSalary: "4-5K",
      inferredExperience: "10年以上",
    });
  });
});
