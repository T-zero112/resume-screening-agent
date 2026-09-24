import { describe, expect, it } from "vitest";

import { buildParseQualityReport } from "../src/parsing/parse-quality.js";
import type { CandidateFeatureSet, CandidateProfile, Evidence, Fact } from "../src/schemas/index.js";

const now = "2026-09-20T00:00:00.000Z";

describe("parse quality report", () => {
  it("marks usable parsed resumes as good", () => {
    const report = buildParseQualityReport({
      sourceFilePath: "resume.pdf",
      documentName: "resume.pdf",
      documentType: "pdf",
      evidence: [buildEvidence(" ".repeat(300)), buildEvidence(" ".repeat(300), 1), buildEvidence(" ".repeat(300), 2)],
      facts: [buildFact()],
      candidateProfile: buildProfile(),
      featureSet: buildFeatureSet(),
      llmWarnings: [],
      generatedAt: now,
    });

    expect(report.status).toBe("good");
    expect(report.signals).toHaveLength(0);
  });

  it("flags very short extraction as failed", () => {
    const report = buildParseQualityReport({
      sourceFilePath: "resume.pdf",
      documentName: "resume.pdf",
      documentType: "pdf",
      evidence: [buildEvidence("短文本")],
      facts: [],
      candidateProfile: buildProfile({ skills: [] }),
      featureSet: { ...buildFeatureSet(), features: [] },
      llmWarnings: [],
      generatedAt: now,
    });

    expect(report.status).toBe("failed");
    expect(report.signals.map((signal) => signal.id)).toEqual(
      expect.arrayContaining(["text.too_short", "facts.empty", "features.empty"]),
    );
  });

  it("does not require review for informational LLM warnings", () => {
    const report = buildParseQualityReport({
      sourceFilePath: "resume.pdf",
      documentName: "resume.pdf",
      documentType: "pdf",
      evidence: [buildEvidence(" ".repeat(300)), buildEvidence(" ".repeat(300), 1), buildEvidence(" ".repeat(300), 2)],
      facts: [buildFact()],
      candidateProfile: buildProfile(),
      featureSet: buildFeatureSet(),
      llmWarnings: ["简历中性别、年龄等敏感个人信息未抽取", "简历未提供项目经历、证书、语言能力等信息，相关字段输出为空数组"],
      generatedAt: now,
    });

    expect(report.status).toBe("good");
    expect(report.signals.map((signal) => signal.id)).toContain("llm.info_warnings");
  });

  it("requires review for timeline and source conflicts", () => {
    const report = buildParseQualityReport({
      sourceFilePath: "resume.pdf",
      documentName: "resume.pdf",
      documentType: "pdf",
      evidence: [buildEvidence(" ".repeat(300)), buildEvidence(" ".repeat(300), 1), buildEvidence(" ".repeat(300), 2)],
      facts: [buildFact()],
      candidateProfile: buildProfile(),
      featureSet: buildFeatureSet(),
      llmWarnings: ["文件名标注薪资与简历正文中自述期望薪资不一致，以正文自述为准，差异需核实。"],
      generatedAt: now,
    });

    expect(report.status).toBe("needs_review");
    expect(report.signals.map((signal) => signal.id)).toContain("llm.warnings");
  });
});

function buildEvidence(rawText: string, blockIndex = 0): Evidence {
  return {
    id: `evidence-${blockIndex + 1}`,
    source: {
      documentId: "doc-001",
      documentName: "resume.pdf",
      documentType: "pdf",
      blockIndex,
    },
    granularity: "block",
    rawText,
    extractionMethod: "parser",
    confidence: 1,
    createdAt: now,
  };
}

function buildFact(): Fact {
  return {
    id: "fact-001",
    candidateId: "candidate-001",
    kind: "skill",
    subject: "candidate",
    predicate: "has_skill",
    object: "TypeScript",
    attributes: {},
    evidenceRefs: [{ evidenceId: "evidence-001" }],
    scoreEligible: true,
    derivationType: "direct",
    confidence: 0.8,
    createdAt: now,
  };
}

function buildProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "candidate-001",
    schemaVersion: "candidate-profile.v1",
    contactInfo: {
      name: "张三",
      phone: "13800000000",
      links: [],
      missingState: "present",
      evidenceRefs: [],
    },
    education: [{ school: "某大学", evidenceRefs: [], confidence: 0.8 }],
    workExperience: [{ company: "某公司", responsibilities: ["销售"], achievements: [], quantifiedImpacts: [], technologies: [], businessDomains: [], evidenceRefs: [], confidence: 0.8 }],
    projectExperience: [],
    skills: [{ name: "沟通", category: "other", evidenceRefs: [], confidence: 0.8 }],
    certificates: [],
    awards: [],
    publications: [],
    patents: [],
    openSourceContributions: [],
    languages: [],
    timeline: [],
    otherJobRelatedInfo: [],
    unresolvedItems: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildFeatureSet(): CandidateFeatureSet {
  return {
    candidateId: "candidate-001",
    schemaVersion: "candidate-features.v1",
    features: [
      {
        key: "skill.typescript.exists",
        group: "skill",
        value: true,
        valueType: "boolean",
        scorePolicy: "jd_dependent",
        derivationType: "direct",
        derivationNote: "候选人提到 TypeScript。",
        sourceFactIds: ["fact-001"],
        evidenceRefs: [{ evidenceId: "evidence-001" }],
        jdRequirementRefs: [],
        confidence: 0.8,
      },
    ],
    generatedAt: now,
  };
}
