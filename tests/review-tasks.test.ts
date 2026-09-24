import { describe, expect, it } from "vitest";

import { buildReviewTasks } from "../src/review/review-tasks.js";
import type { CandidateProfile, ParseQualityReport } from "../src/schemas/index.js";

const now = "2026-09-21T00:00:00.000Z";

describe("review tasks", () => {
  it("turns warnings and metadata conflicts into structured review tasks", () => {
    const taskSet = buildReviewTasks({
      candidateId: "candidate-001",
      sourceFilePath: "resume.pdf",
      candidateProfile: buildProfile(),
      parseQualityReport: buildQualityReport(),
      llmWarnings: [
        "简历中性别、年龄等敏感个人信息未抽取",
        "日期区间与具体公司/岗位未显式绑定，需人工核验。",
        "文件名标注薪资与正文期望薪资不一致。",
      ],
      sourceMetadata: {
        source: "filename",
        rawFileName: "【业务员_珠海 4-5K】候选人.pdf",
        inferredTitle: "业务员",
        inferredLocation: "珠海",
        inferredSalary: "4-5K",
        confidence: 0.6,
      },
      generatedAt: now,
    });

    expect(taskSet.tasks.some((task) => task.type === "timeline_conflict")).toBe(true);
    expect(taskSet.tasks.some((task) => task.type === "source_metadata_conflict")).toBe(true);
    expect(
      taskSet.tasks.some((task) => task.resolutionMode === "informational" && task.status === "resolved"),
    ).toBe(true);
  });
});

function buildProfile(): CandidateProfile {
  return {
    id: "candidate-001",
    schemaVersion: "candidate-profile.v1",
    contactInfo: {
      name: "候选人",
      links: [],
      missingState: "present",
      evidenceRefs: [],
    },
    education: [],
    workExperience: [],
    projectExperience: [],
    skills: [],
    certificates: [],
    awards: [],
    publications: [],
    patents: [],
    openSourceContributions: [],
    languages: [],
    jobPreference: {
      expectedTitles: ["销售"],
      expectedLocations: ["中山"],
      expectedSalary: "7-12K",
      employmentTypes: [],
      evidenceRefs: [],
      confidence: 0.8,
    },
    timeline: [],
    otherJobRelatedInfo: [],
    unresolvedItems: ["2021.01至2024.02期间经历缺失"],
    createdAt: now,
    updatedAt: now,
  };
}

function buildQualityReport(): ParseQualityReport {
  return {
    schemaVersion: "parse-quality.v1",
    status: "needs_review",
    sourceFilePath: "resume.pdf",
    documentName: "resume.pdf",
    documentType: "pdf",
    metrics: {
      evidenceCount: 5,
      totalTextLength: 1000,
      averageEvidenceLength: 200,
      factCount: 10,
      featureCount: 12,
      educationCount: 0,
      workExperienceCount: 0,
      projectExperienceCount: 0,
      skillCount: 0,
      unresolvedItemCount: 1,
      llmWarningCount: 3,
    },
    signals: [
      {
        id: "llm.warnings",
        severity: "warning",
        message: "LLM 结构化阶段返回了警告信息，需要结合原文证据复核。",
      },
    ],
    generatedAt: now,
  };
}
