import { z } from "zod";

export const FeatureKeySchema = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/, {
  message: "Feature keys must use stable dotted notation, for example skill.typescript.exists.",
});

export const RequirementTypeSchema = z.enum([
  "skill",
  "experience",
  "project",
  "education",
  "language",
  "preference",
  "credential",
  "domain",
  "achievement",
  "other",
]);
export type RequirementType = z.infer<typeof RequirementTypeSchema>;

export const RequirementConditionSchema = z.object({
  featureKey: FeatureKeySchema,
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "includes", "exists"]),
  expectedValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});
export type RequirementCondition = z.infer<typeof RequirementConditionSchema>;

export const RequirementSchema = z.object({
  id: z.string().min(1),
  type: RequirementTypeSchema,
  description: z.string().min(1),
  condition: RequirementConditionSchema,
  alternativeConditions: z.array(RequirementConditionSchema).default([]),
  isHardRequirement: z.boolean().default(false),
  evidenceRequired: z.boolean().default(true),
  allowHumanReview: z.boolean().default(true),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const DimensionScoringRuleSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1),
  description: z.string().min(1),
  maxPoints: z.number().min(0).max(100),
});
export type DimensionScoringRule = z.infer<typeof DimensionScoringRuleSchema>;

export const ScoreDimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().min(0).max(1),
  maxScore: z.literal(100).default(100),
  scoringRules: z.array(DimensionScoringRuleSchema).default([]),
});
export type ScoreDimension = z.infer<typeof ScoreDimensionSchema>;

export const ReviewFlagRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  condition: RequirementConditionSchema.optional(),
});
export type ReviewFlagRule = z.infer<typeof ReviewFlagRuleSchema>;

export const ScorecardSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal("scorecard.v1"),
  jobId: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  title: z.string().min(1),
  requirements: z.array(RequirementSchema),
  dimensions: z.array(ScoreDimensionSchema),
  reviewFlagRules: z.array(ReviewFlagRuleSchema).default([]),
  createdBy: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((scorecard, ctx) => {
  const weightTotal = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (scorecard.dimensions.length > 0 && Math.abs(weightTotal - 1) > 0.000001) {
    ctx.addIssue({
      code: "custom",
      message: "Score dimension weights must sum to 1.",
      path: ["dimensions"],
    });
  }

  const requirementIds = new Set(scorecard.requirements.map((requirement) => requirement.id));

  scorecard.dimensions.forEach((dimension, dimensionIndex) => {
    const pointsTotal = dimension.scoringRules.reduce((sum, rule) => sum + rule.maxPoints, 0);
    if (dimension.scoringRules.length > 0 && Math.abs(pointsTotal - 100) > 0.000001) {
      ctx.addIssue({
        code: "custom",
        message: "Scoring rules in each dimension must sum to 100 points.",
        path: ["dimensions", dimensionIndex, "scoringRules"],
      });
    }

    dimension.scoringRules.forEach((rule, ruleIndex) => {
      if (!requirementIds.has(rule.requirementId)) {
        ctx.addIssue({
          code: "custom",
          message: "Dimension scoring rules must reference existing requirements.",
          path: ["dimensions", dimensionIndex, "scoringRules", ruleIndex, "requirementId"],
        });
      }
    });
  });
});
export type Scorecard = z.infer<typeof ScorecardSchema>;
