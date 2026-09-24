import { z } from "zod";

import { EvidenceRefSchema } from "./common.js";

export const ReviewTaskTypeSchema = z.enum([
  "timeline_conflict",
  "source_metadata_conflict",
  "experience_attribution_unclear",
  "missing_or_incomplete_field",
  "subjective_claim",
  "document_noise",
  "llm_warning",
  "parse_quality",
  "other",
]);
export type ReviewTaskType = z.infer<typeof ReviewTaskTypeSchema>;

export const ReviewTaskResolutionModeSchema = z.enum([
  "rule_resolved",
  "llm_candidate",
  "human_required",
  "informational",
]);
export type ReviewTaskResolutionMode = z.infer<typeof ReviewTaskResolutionModeSchema>;

export const ReviewTaskSchema = z.object({
  id: z.string().min(1),
  type: ReviewTaskTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  question: z.string().min(1),
  source: z.enum(["parse_quality", "llm_warning", "unresolved_item", "source_metadata", "rule"]),
  resolutionMode: ReviewTaskResolutionModeSchema,
  status: z.enum(["open", "resolved", "ignored"]).default("open"),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  relatedText: z.string().optional(),
  recommendation: z.string().optional(),
});
export type ReviewTask = z.infer<typeof ReviewTaskSchema>;

export const ReviewTaskSetSchema = z.object({
  schemaVersion: z.literal("review-tasks.v1"),
  candidateId: z.string().min(1),
  sourceFilePath: z.string().min(1),
  tasks: z.array(ReviewTaskSchema),
  generatedAt: z.string().datetime(),
});
export type ReviewTaskSet = z.infer<typeof ReviewTaskSetSchema>;

export const ReviewResolutionSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["resolved", "still_needs_human", "not_enough_evidence"]),
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
  shouldAffectScoring: z.boolean(),
  suggestedAction: z.string().min(1),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
});
export type ReviewResolution = z.infer<typeof ReviewResolutionSchema>;

export const ReviewResolutionSetSchema = z.object({
  schemaVersion: z.literal("review-resolutions.v1"),
  candidateId: z.string().min(1),
  sourceFilePath: z.string().min(1),
  resolutions: z.array(ReviewResolutionSchema),
  skippedTaskIds: z.array(z.string()).default([]),
  generatedAt: z.string().datetime(),
  llm: z
    .object({
      provider: z.string().min(1),
      baseURL: z.string().optional(),
      model: z.string().min(1),
    })
    .optional(),
});
export type ReviewResolutionSet = z.infer<typeof ReviewResolutionSetSchema>;

export const CandidateReviewItemSchema = z.object({
  requirementId: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["matched", "not_matched", "needs_review"]),
  featureKey: z.string().min(1),
  featureLabel: z.string().optional(),
  featureDisplayValue: z.string().optional(),
  explanation: z.string().min(1),
  evidenceQuotes: z.array(z.string()).default([]),
});
export type CandidateReviewItem = z.infer<typeof CandidateReviewItemSchema>;

export const CandidateReviewSchema = z.object({
  schemaVersion: z.literal("candidate-review.v1"),
  candidateId: z.string().min(1),
  scorecardId: z.string().min(1),
  jobId: z.string().min(1),
  totalScore: z.number().min(0).max(100),
  hardRequirementStatus: z.enum(["pass", "fail", "needs_review"]),
  dimensions: z.array(
    z.object({
      dimensionId: z.string().min(1),
      name: z.string().min(1),
      score: z.number().min(0).max(100),
      weightedScore: z.number().min(0).max(100),
    }),
  ),
  matchedItems: z.array(CandidateReviewItemSchema),
  gapItems: z.array(CandidateReviewItemSchema),
  reviewItems: z.array(CandidateReviewItemSchema),
  reviewFlags: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  generatedAt: z.string().datetime(),
});
export type CandidateReview = z.infer<typeof CandidateReviewSchema>;
