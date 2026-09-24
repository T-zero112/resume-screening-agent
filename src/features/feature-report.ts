import type { CandidateFeatureSet, FeatureGroup } from "../schemas/index.js";

export type FeatureReport = {
  candidateId: string;
  totalFeatures: number;
  groupCounts: Partial<Record<FeatureGroup, number>>;
  hashSlugCount: number;
  hashSlugKeys: string[];
  missingLabelCount: number;
  missingDisplayValueCount: number;
  missingEvidenceCount: number;
  missingSourceFactCount: number;
  warnings: string[];
  generatedAt: string;
};

export function buildFeatureReport(featureSet: CandidateFeatureSet, generatedAt = new Date().toISOString()): FeatureReport {
  const groupCounts: Partial<Record<FeatureGroup, number>> = {};
  const hashSlugKeys = featureSet.features
    .map((feature) => feature.key)
    .filter((key) => key.split(".").some((part) => /^zh_[a-z0-9]+$/.test(part)));
  const missingLabelCount = featureSet.features.filter((feature) => !feature.label).length;
  const missingDisplayValueCount = featureSet.features.filter((feature) => !feature.displayValue).length;
  const missingEvidenceCount = featureSet.features.filter((feature) => feature.evidenceRefs.length === 0).length;
  const missingSourceFactCount = featureSet.features.filter((feature) => feature.sourceFactIds.length === 0).length;

  for (const feature of featureSet.features) {
    groupCounts[feature.group] = (groupCounts[feature.group] ?? 0) + 1;
  }

  const warnings = [
    hashSlugKeys.length > 0 ? `发现 ${hashSlugKeys.length} 个 hash slug key，建议补充中文标准化映射表。` : undefined,
    missingLabelCount > 0 ? `发现 ${missingLabelCount} 个 Feature 缺少 label。` : undefined,
    missingDisplayValueCount > 0 ? `发现 ${missingDisplayValueCount} 个 Feature 缺少 displayValue。` : undefined,
    missingEvidenceCount > 0 ? `发现 ${missingEvidenceCount} 个 Feature 缺少 evidenceRefs。` : undefined,
    missingSourceFactCount > 0 ? `发现 ${missingSourceFactCount} 个 Feature 缺少 sourceFactIds。` : undefined,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    candidateId: featureSet.candidateId,
    totalFeatures: featureSet.features.length,
    groupCounts,
    hashSlugCount: hashSlugKeys.length,
    hashSlugKeys,
    missingLabelCount,
    missingDisplayValueCount,
    missingEvidenceCount,
    missingSourceFactCount,
    warnings,
    generatedAt,
  };
}
