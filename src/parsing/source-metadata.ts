import path from "node:path";

export type SourceMetadata = {
  source: "filename";
  rawFileName: string;
  inferredTitle?: string;
  inferredLocation?: string;
  inferredSalary?: string;
  inferredExperience?: string;
  confidence: number;
};

const BRACKETED_PREFIX_PATTERN = /^【(?<content>[^】]+)】/;
const SALARY_PATTERN = /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*[kK]\b/;
const EXPERIENCE_PATTERN = /\d+\s*(?:年以上|年以内|年)(?:工作经验|经验)?/;

export function extractSourceMetadata(filePath: string): SourceMetadata {
  const rawFileName = path.basename(filePath);
  const nameWithoutExtension = rawFileName.replace(/\.[^.]+$/, "");
  const bracketContent = BRACKETED_PREFIX_PATTERN.exec(nameWithoutExtension)?.groups?.content;
  const tokens = bracketContent ? splitMetadataTokens(bracketContent) : [];
  const salary = nameWithoutExtension.match(SALARY_PATTERN)?.[0]?.replace(/\s+/g, "");
  const experience = nameWithoutExtension.match(EXPERIENCE_PATTERN)?.[0]?.replace(/\s+/g, "");

  return {
    source: "filename",
    rawFileName,
    inferredTitle: tokens[0],
    inferredLocation: tokens[1],
    inferredSalary: salary,
    inferredExperience: experience,
    confidence: bracketContent || salary || experience ? 0.6 : 0.2,
  };
}

function splitMetadataTokens(value: string): string[] {
  return value
    .replace(SALARY_PATTERN, "")
    .split(/[_\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
