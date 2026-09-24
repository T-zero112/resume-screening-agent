import { z } from "zod";

import { EvidenceRefSchema } from "./common.js";

export const RequirementMatchStatusSchema = z.enum(["matched", "not_matched", "needs_review"]);
export type RequirementMatchStatus = z.infer<typeof RequirementMatchStatusSchema>;

export const HardRequirementStatusSchema = z.enum(["pass", "fail", "needs_review"]);
export type HardRequirementStatus = z.infer<typeof HardRequirementStatusSchema>;

export const RequirementEvaluationSchema = z.object({
  requirementId: z.string().min(1),
  description: z.string().min(1),
  featureKey: z.string().min(1),
  status: RequirementMatchStatusSchema,
  expectedValue: z.unknown().optional(),
  actualValue: z.unknown().optional(),
  featureLabel: z.string().optional(),
  featureDisplayValue: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  explanation: z.string().min(1),
});
export type RequirementEvaluation = z.infer<typeof RequirementEvaluationSchema>;

export const DimensionEvaluationSchema = z.object({
  dimensionId: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  score: z.number().min(0).max(100),
  weightedScore: z.number().min(0).max(100),
  rules: z.array(
    z.object({
      ruleId: z.string().min(1),
      requirementId: z.string().min(1),
      description: z.string().min(1),
      maxPoints: z.number().min(0).max(100),
      awardedPoints: z.number().min(0).max(100),
      status: RequirementMatchStatusSchema,
    }),
  ),
});
export type DimensionEvaluation = z.infer<typeof DimensionEvaluationSchema>;

export const ReviewFlagSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});
export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;

export const EvaluationResultSchema = z.object({
  schemaVersion: z.literal("evaluation-result.v1"),
  candidateId: z.string().min(1),
  scorecardId: z.string().min(1),
  jobId: z.string().min(1),
  hardRequirementStatus: HardRequirementStatusSchema,
  totalScore: z.number().min(0).max(100),
  requirementEvaluations: z.array(RequirementEvaluationSchema),
  dimensions: z.array(DimensionEvaluationSchema),
  reviewFlags: z.array(ReviewFlagSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
