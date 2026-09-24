import { z } from "zod";

export const ScoreStandardStatusSchema = z.enum(["draft", "confirmed"]);
export type ScoreStandardStatus = z.infer<typeof ScoreStandardStatusSchema>;

export const ScoreStandardDimensionSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  maxScore: z.number().int().positive(),
  description: z.string().min(1),
  highScoreGuidance: z.string().min(1),
  lowScoreGuidance: z.string().min(1),
});
export type ScoreStandardDimension = z.infer<typeof ScoreStandardDimensionSchema>;

export const HardRequirementSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  isHardGate: z.boolean().default(false),
  missingMeansFail: z.boolean().default(false),
  reviewOnlyWhenMissing: z.boolean().default(true),
});
export type HardRequirement = z.infer<typeof HardRequirementSchema>;

export const BonusSignalSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});
export type BonusSignal = z.infer<typeof BonusSignalSchema>;

export const RiskSignalSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  affectsScore: z.boolean().default(false),
  description: z.string().optional(),
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export const CapRuleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  maxFinalScore: z.number().int().min(0).max(100),
  condition: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type CapRule = z.infer<typeof CapRuleSchema>;

export const ExcludedSignalSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  reason: z.string().min(1),
});
export type ExcludedSignal = z.infer<typeof ExcludedSignalSchema>;

export const ScoreStandardSchema = z
  .object({
    schemaVersion: z.literal("score-standard.v1"),
    id: z.string().min(1),
    jobId: z.string().min(1),
    version: z.number().int().positive(),
    status: ScoreStandardStatusSchema.default("draft"),
    totalScore: z.literal(100),
    dimensions: z.array(ScoreStandardDimensionSchema).min(1),
    hardRequirements: z.array(HardRequirementSchema).default([]),
    bonusSignals: z.array(BonusSignalSchema).default([]),
    riskSignals: z.array(RiskSignalSchema).default([]),
    capRules: z.array(CapRuleSchema).default([]),
    excludedSignals: z.array(ExcludedSignalSchema).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((standard, ctx) => {
    const dimensionTotal = standard.dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0);
    if (dimensionTotal !== standard.totalScore) {
      ctx.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: `dimension maxScore total must equal ${standard.totalScore}; received ${dimensionTotal}`,
      });
    }

    const uniqueGroups: Array<[string, Array<{ key: string }>]> = [
      ["dimensions", standard.dimensions],
      ["hardRequirements", standard.hardRequirements],
      ["bonusSignals", standard.bonusSignals],
      ["riskSignals", standard.riskSignals],
      ["capRules", standard.capRules],
      ["excludedSignals", standard.excludedSignals],
    ];

    for (const [path, entries] of uniqueGroups) {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.key)) {
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: `duplicate key: ${entry.key}`,
          });
        }
        seen.add(entry.key);
      }
    }
  });
export type ScoreStandard = z.infer<typeof ScoreStandardSchema>;
