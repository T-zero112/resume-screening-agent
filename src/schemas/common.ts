import { z } from "zod";

export const MissingStateSchema = z.enum(["present", "missing", "unknown"]);
export type MissingState = z.infer<typeof MissingStateSchema>;

export const ConfidenceSchema = z.number().min(0).max(1);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const DatePrecisionSchema = z.enum(["day", "month", "year", "unknown"]);
export type DatePrecision = z.infer<typeof DatePrecisionSchema>;

export const PartialDateSchema = z.object({
  raw: z.string().min(1),
  year: z.number().int().min(1900).max(2200).optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  precision: DatePrecisionSchema.default("unknown"),
});
export type PartialDate = z.infer<typeof PartialDateSchema>;

export const DateRangeSchema = z.object({
  start: PartialDateSchema.optional(),
  end: PartialDateSchema.optional(),
  isCurrent: z.boolean().default(false),
  raw: z.string().optional(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const EvidenceRefSchema = z.object({
  evidenceId: z.string().min(1),
  quote: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const WithEvidenceSchema = z.object({
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type WithEvidence = z.infer<typeof WithEvidenceSchema>;
