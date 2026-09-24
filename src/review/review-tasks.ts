import type {
  CandidateProfile,
  ParseQualityReport,
  ReviewTask,
  ReviewTaskSet,
} from "../schemas/index.js";
import type { SourceMetadata } from "../parsing/source-metadata.js";

export type BuildReviewTasksInput = {
  candidateId: string;
  sourceFilePath: string;
  candidateProfile: CandidateProfile;
  parseQualityReport: ParseQualityReport;
  llmWarnings: string[];
  sourceMetadata: SourceMetadata;
  generatedAt: string;
};

export function buildReviewTasks(input: BuildReviewTasksInput): ReviewTaskSet {
  const tasks = [
    ...tasksFromQuality(input.parseQualityReport),
    ...tasksFromWarnings(input.llmWarnings),
    ...tasksFromUnresolvedItems(input.candidateProfile.unresolvedItems),
    ...tasksFromSourceMetadata(input.sourceMetadata, input.candidateProfile),
  ];

  return {
    schemaVersion: "review-tasks.v1",
    candidateId: input.candidateId,
    sourceFilePath: input.sourceFilePath,
    tasks: dedupeTasks(tasks).map((task, index) => ({
      ...task,
      id: `review-task-${String(index + 1).padStart(3, "0")}`,
    })),
    generatedAt: input.generatedAt,
  };
}

function tasksFromQuality(report: ParseQualityReport): Omit<ReviewTask, "id">[] {
  return report.signals
    .filter((signal) => signal.severity !== "info")
    .map((signal) => ({
      type: "parse_quality" as const,
      severity: signal.severity === "error" ? ("high" as const) : ("medium" as const),
      question: signal.message,
      source: "parse_quality" as const,
      resolutionMode: signal.severity === "error" ? ("human_required" as const) : ("llm_candidate" as const),
      status: "open" as const,
      evidenceRefs: [],
      relatedText: signal.id,
      recommendation: signal.severity === "error" ? "解析结果不可直接用于评分。" : "结合原文证据复核后再进入评分。",
    }));
}

function tasksFromWarnings(warnings: string[]): Omit<ReviewTask, "id">[] {
  return warnings.map((warning) => {
    const type = classifyReviewTaskType(warning);
    const isInformational = isInformationalWarning(warning);

    return {
      type,
      severity: isInformational ? ("low" as const) : severityForType(type),
      question: warning,
      source: "llm_warning" as const,
      resolutionMode: isInformational ? ("informational" as const) : resolutionModeForType(type),
      status: isInformational ? ("resolved" as const) : ("open" as const),
      evidenceRefs: [],
      relatedText: warning,
      recommendation: recommendationForType(type, isInformational),
    };
  });
}

function tasksFromUnresolvedItems(items: string[]): Omit<ReviewTask, "id">[] {
  return items.map((item) => {
    const type = classifyReviewTaskType(item);
    return {
      type,
      severity: severityForType(type),
      question: item,
      source: "unresolved_item" as const,
      resolutionMode: resolutionModeForType(type),
      status: "open" as const,
      evidenceRefs: [],
      relatedText: item,
      recommendation: recommendationForType(type, false),
    };
  });
}

function tasksFromSourceMetadata(
  metadata: SourceMetadata,
  profile: CandidateProfile,
): Omit<ReviewTask, "id">[] {
  const tasks: Omit<ReviewTask, "id">[] = [];
  const preference = profile.jobPreference;
  const locations = preference?.expectedLocations ?? [];
  const salary = preference?.expectedSalary;

  if (metadata.inferredLocation && locations.length > 0 && !locations.includes(metadata.inferredLocation)) {
    tasks.push({
      type: "source_metadata_conflict",
      severity: "medium",
      question: `文件名地点“${metadata.inferredLocation}”与正文求职地点“${locations.join("、")}”不一致。`,
      source: "source_metadata",
      resolutionMode: "rule_resolved",
      status: "resolved",
      evidenceRefs: [],
      relatedText: metadata.rawFileName,
      recommendation: "正文求职偏好优先，文件名仅作为外部线索保留。",
    });
  }

  if (metadata.inferredSalary && salary && normalizeSalary(metadata.inferredSalary) !== normalizeSalary(salary)) {
    tasks.push({
      type: "source_metadata_conflict",
      severity: "medium",
      question: `文件名薪资“${metadata.inferredSalary}”与正文期望薪资“${salary}”不一致。`,
      source: "source_metadata",
      resolutionMode: "rule_resolved",
      status: "resolved",
      evidenceRefs: [],
      relatedText: metadata.rawFileName,
      recommendation: "正文期望薪资优先，文件名薪资仅作为外部线索保留。",
    });
  }

  if ((metadata.inferredTitle || metadata.inferredLocation || metadata.inferredSalary) && !preference) {
    tasks.push({
      type: "missing_or_incomplete_field",
      severity: "low",
      question: "文件名包含岗位、地点或薪资线索，但正文未抽取到明确求职偏好。",
      source: "source_metadata",
      resolutionMode: "informational",
      status: "resolved",
      evidenceRefs: [],
      relatedText: metadata.rawFileName,
      recommendation: "不要用文件名直接补写正文求职偏好，可在人工查看时作为辅助线索。",
    });
  }

  return tasks;
}

function classifyReviewTaskType(text: string): ReviewTask["type"] {
  if (/(证书|会计证|资格证|语言能力|奖项|项目|论文|专利).*(未提供|未提及|缺失|为空数组|未抽取)/.test(text)) {
    return "missing_or_incomplete_field";
  }

  if (/时间|日期|年限|空档|重叠|至今|起止|跨度|在职学历|工作经验/.test(text)) {
    return "timeline_conflict";
  }

  if (/文件名|正文|期望薪资|期望城市|求职地点|标注/.test(text)) {
    return "source_metadata_conflict";
  }

  if (/对应关系|归属|绑定|版式|混排|错位|职责/.test(text)) {
    return "experience_attribution_unclear";
  }

  if (/乱码|水印|页脚|编码|随机字符串/.test(text)) {
    return "document_noise";
  }

  if (/自述|主观|擅长|熟悉|精通|责任心|沟通能力|执行能力/.test(text)) {
    return "subjective_claim";
  }

  if (/未提供|未提及|缺失|为空数组|未抽取/.test(text)) {
    return "missing_or_incomplete_field";
  }

  return "llm_warning";
}

function isInformationalWarning(text: string): boolean {
  if (/敏感|性别|年龄|婚育|出生年月/.test(text) && /未抽取|排除|未写入/.test(text)) {
    return true;
  }

  return /未提供|未提及|为空数组/.test(text) && !/联系电话|手机号|联系方式|时间|对应关系|冲突/.test(text);
}

function severityForType(type: ReviewTask["type"]): ReviewTask["severity"] {
  if (type === "timeline_conflict" || type === "experience_attribution_unclear") {
    return "high";
  }

  if (type === "source_metadata_conflict") {
    return "medium";
  }

  return "low";
}

function resolutionModeForType(type: ReviewTask["type"]): ReviewTask["resolutionMode"] {
  if (type === "timeline_conflict" || type === "experience_attribution_unclear") {
    return "llm_candidate";
  }

  if (type === "source_metadata_conflict") {
    return "rule_resolved";
  }

  if (type === "document_noise" || type === "subjective_claim" || type === "missing_or_incomplete_field") {
    return "informational";
  }

  return "human_required";
}

function recommendationForType(type: ReviewTask["type"], isInformational: boolean): string {
  if (isInformational) {
    return "作为提示保留，不单独阻断后续流程。";
  }

  if (type === "timeline_conflict") {
    return "建议后续使用 LLM resolver 结合相关 evidence 判断时间线，必要时人工确认。";
  }

  if (type === "experience_attribution_unclear") {
    return "建议后续使用 LLM resolver 判断职责、公司、岗位和日期的归属关系。";
  }

  if (type === "source_metadata_conflict") {
    return "正文信息优先，文件名线索仅作为辅助来源。";
  }

  if (type === "subjective_claim") {
    return "不要直接用于评分，可作为面试追问线索。";
  }

  return "人工查看后决定是否影响评分。";
}

function dedupeTasks(tasks: Omit<ReviewTask, "id">[]): Omit<ReviewTask, "id">[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = `${task.type}:${task.question}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeSalary(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}
