import { z } from "zod";

import { ConfidenceSchema } from "./common.js";

export const SourceDocumentTypeSchema = z.enum(["pdf", "docx", "txt", "unknown"]);
export type SourceDocumentType = z.infer<typeof SourceDocumentTypeSchema>;

export const EvidenceSourceSchema = z.object({
  documentId: z.string().min(1),
  documentName: z.string().min(1),
  documentType: SourceDocumentTypeSchema,
  pageNumber: z.number().int().positive().optional(),
  sectionName: z.string().optional(),
  blockId: z.string().optional(),
  blockIndex: z.number().int().nonnegative().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceGranularitySchema = z.enum(["document", "page", "block", "paragraph", "sentence", "field"]);
export type EvidenceGranularity = z.infer<typeof EvidenceGranularitySchema>;

export const BoundingBoxSchema = z.object({
  pageNumber: z.number().int().positive(),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  source: EvidenceSourceSchema,
  granularity: EvidenceGranularitySchema.default("block"),
  rawText: z.string().min(1),
  normalizedText: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  extractionMethod: z.enum(["parser", "ocr", "vision", "llm", "human", "rule"]).default("parser"),
  confidence: ConfidenceSchema.default(1),
  createdAt: z.string().datetime(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
