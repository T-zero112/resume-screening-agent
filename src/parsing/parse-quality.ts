import path from "node:path";

import type { CandidateProfile, Evidence, Fact, ParseQualityReport, SourceDocumentType } from "../schemas/index.js";
import type { CandidateFeatureSet } from "../schemas/feature.js";

export type BuildParseQualityReportInput = {
  sourceFilePath: string;
  documentName: string;
  documentType: SourceDocumentType;
  evidence: Evidence[];
  facts: Fact[];
  candidateProfile: CandidateProfile;
  featureSet: CandidateFeatureSet;
  llmWarnings: string[];
  generatedAt: string;
};

export function buildParseQualityReport(input: BuildParseQualityReportInput): ParseQualityReport {
  const totalTextLength = input.evidence.reduce((sum, item) => sum + item.rawText.length, 0);
  const averageEvidenceLength = input.evidence.length === 0 ? 0 : Math.round(totalTextLength / input.evidence.length);
  const signals = [
    ...buildTextSignals(input.evidence.length, totalTextLength),
    ...buildProfileSignals(input.candidateProfile),
    ...buildExtractionSignals(input.facts.length, input.featureSet.features.length, input.llmWarnings),
  ];

  const hasError = signals.some((signal) => signal.severity === "error");
  const hasWarning = signals.some((signal) => signal.severity === "warning");

  return {
    schemaVersion: "parse-quality.v1",
    status: hasError ? "failed" : hasWarning ? "needs_review" : "good",
    sourceFilePath: path.resolve(input.sourceFilePath),
    documentName: input.documentName,
    documentType: input.documentType,
    metrics: {
      evidenceCount: input.evidence.length,
      totalTextLength,
      averageEvidenceLength,
      factCount: input.facts.length,
      featureCount: input.featureSet.features.length,
      educationCount: input.candidateProfile.education.length,
      workExperienceCount: input.candidateProfile.workExperience.length,
      projectExperienceCount: input.candidateProfile.projectExperience.length,
      skillCount: input.candidateProfile.skills.length,
      unresolvedItemCount: input.candidateProfile.unresolvedItems.length,
      llmWarningCount: input.llmWarnings.length,
    },
    signals,
    generatedAt: input.generatedAt,
  };
}

function buildTextSignals(evidenceCount: number, totalTextLength: number) {
  const signals = [];

  if (totalTextLength < 100) {
    signals.push({
      id: "text.too_short",
      severity: "error" as const,
      message: "抽取到的正文过短，可能是扫描件、图片简历或文件解析失败。",
    });
  } else if (totalTextLength < 600) {
    signals.push({
      id: "text.short",
      severity: "warning" as const,
      message: "抽取到的正文偏短，建议人工确认是否遗漏了关键信息。",
    });
  }

  if (evidenceCount === 0) {
    signals.push({
      id: "evidence.empty",
      severity: "error" as const,
      message: "没有生成任何原文证据块，后续结构化结果不可用。",
    });
  } else if (evidenceCount < 3) {
    signals.push({
      id: "evidence.too_few",
      severity: "warning" as const,
      message: "原文证据块数量偏少，可能影响字段定位和评分证据。",
    });
  }

  return signals;
}

function buildProfileSignals(profile: CandidateProfile) {
  const signals = [];

  if (!profile.contactInfo.name) {
    signals.push({
      id: "profile.name_missing",
      severity: "warning" as const,
      message: "未抽取到候选人姓名。",
    });
  }

  if (!profile.contactInfo.phone && !profile.contactInfo.email) {
    signals.push({
      id: "profile.contact_missing",
      severity: "warning" as const,
      message: "未抽取到电话或邮箱，后续联系信息可能不完整。",
    });
  }

  if (profile.education.length === 0) {
    signals.push({
      id: "profile.education_missing",
      severity: "warning" as const,
      message: "未抽取到教育经历。",
    });
  }

  if (profile.workExperience.length === 0 && profile.projectExperience.length === 0) {
    signals.push({
      id: "profile.experience_missing",
      severity: "warning" as const,
      message: "未抽取到工作经历或项目经历。",
    });
  }

  if (profile.skills.length === 0) {
    signals.push({
      id: "profile.skills_missing",
      severity: "warning" as const,
      message: "未抽取到技能信息。",
    });
  }

  if (profile.unresolvedItems.length > 0) {
    signals.push({
      id: "profile.unresolved_items",
      severity: "info" as const,
      message: "存在未能稳定归类的信息，建议后续人工查看。",
    });
  }

  return signals;
}

function buildExtractionSignals(factCount: number, featureCount: number, llmWarnings: string[]) {
  const signals = [];

  if (factCount === 0) {
    signals.push({
      id: "facts.empty",
      severity: "error" as const,
      message: "没有生成结构化事实，无法进行可靠特征生成和评分。",
    });
  }

  if (featureCount === 0) {
    signals.push({
      id: "features.empty",
      severity: "error" as const,
      message: "没有生成候选人特征，无法进入评分环节。",
    });
  }

  const reviewWarnings = llmWarnings.filter((warning) => classifyLlmWarning(warning) === "warning");
  const infoWarnings = llmWarnings.length - reviewWarnings.length;

  if (reviewWarnings.length > 0) {
    signals.push({
      id: "llm.warnings",
      severity: "warning" as const,
      message: "LLM 结构化阶段返回了警告信息，需要结合原文证据复核。",
    });
  }

  if (infoWarnings > 0) {
    signals.push({
      id: "llm.info_warnings",
      severity: "info" as const,
      message: "LLM 结构化阶段返回了提示信息，但不单独触发人工复核。",
    });
  }

  return signals;
}

function classifyLlmWarning(warning: string): "info" | "warning" {
  if (/敏感|性别|年龄|婚育|出生年月/.test(warning) && /未抽取|排除|未写入/.test(warning)) {
    return "info";
  }

  if (/未提供|未提及|为空数组|缺失/.test(warning) && !/联系电话|手机号|联系方式/.test(warning)) {
    return "info";
  }

  return "warning";
}
