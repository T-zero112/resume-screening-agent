import { z } from "zod";

export const ParseQualityStatusSchema = z.enum(["good", "needs_review", "failed"]);
export type ParseQualityStatus = z.infer<typeof ParseQualityStatusSchema>;

export const ParseQualitySignalSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
});
export type ParseQualitySignal = z.infer<typeof ParseQualitySignalSchema>;

export const ParseQualityReportSchema = z.object({
  schemaVersion: z.literal("parse-quality.v1"),
  status: ParseQualityStatusSchema,
  sourceFilePath: z.string().min(1),
  documentName: z.string().min(1),
  documentType: z.enum(["pdf", "docx", "txt", "unknown"]),
  metrics: z.object({
    evidenceCount: z.number().int().nonnegative(),
    totalTextLength: z.number().int().nonnegative(),
    averageEvidenceLength: z.number().nonnegative(),
    factCount: z.number().int().nonnegative(),
    featureCount: z.number().int().nonnegative(),
    educationCount: z.number().int().nonnegative(),
    workExperienceCount: z.number().int().nonnegative(),
    projectExperienceCount: z.number().int().nonnegative(),
    skillCount: z.number().int().nonnegative(),
    unresolvedItemCount: z.number().int().nonnegative(),
    llmWarningCount: z.number().int().nonnegative(),
  }),
  signals: z.array(ParseQualitySignalSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type ParseQualityReport = z.infer<typeof ParseQualityReportSchema>;
