import { z } from "zod";

export const LlmScoreComponentKeySchema = z.string().min(1);
export type LlmScoreComponentKey = z.infer<typeof LlmScoreComponentKeySchema>;

export const LlmScoreComponentSchema = z.object({
  key: LlmScoreComponentKeySchema,
  name: z.string().min(1),
  score: z.number().int().min(0),
  maxScore: z.number().int().positive(),
  evidence: z.string().min(1),
}).superRefine((component, ctx) => {
  if (component.score > component.maxScore) {
    ctx.addIssue({ code: "custom", path: ["score"], message: "score cannot exceed maxScore" });
  }
});
export type LlmScoreComponent = z.infer<typeof LlmScoreComponentSchema>;

export const HardRequirementScoreSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["met", "not_met", "not_mentioned"]),
  evidence: z.string().min(1),
});
export type HardRequirementScore = z.infer<typeof HardRequirementScoreSchema>;

export const LlmScoreTraceSchema = z.object({
  schemaVersion: z.literal("llm-score-trace.v1"),
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  scorecardId: z.string().min(1),
  roleSummary: z.string().min(1),
  components: z.array(LlmScoreComponentSchema).min(1),
  rawScore: z.number().int().min(0).max(100),
  finalScore: z.number().int().min(0).max(100),
  scoreStandardId: z.string().min(1).optional(),
  scoreStandardVersion: z.number().int().positive().optional(),
  hardRequirementStatus: z.enum(["pass", "fail", "needs_review"]).optional(),
  hardRequirementResults: z.array(HardRequirementScoreSchema).default([]),
  caps: z.array(z.string()).default([]),
  hardGaps: z.array(z.string()).default([]),
  reason: z.string().min(1),
  missing: z.string().default(""),
  generatedAt: z.string().datetime(),
  llm: z.object({
    provider: z.string().min(1),
    baseURL: z.string().optional(),
    model: z.string().min(1),
  }),
}).superRefine((trace, ctx) => {
  const componentTotal = trace.components.reduce((sum, component) => sum + component.score, 0);
  if (componentTotal !== trace.rawScore) {
    ctx.addIssue({ code: "custom", path: ["rawScore"], message: "rawScore must equal the sum of component scores" });
  }
});
export type LlmScoreTrace = z.infer<typeof LlmScoreTraceSchema>;
