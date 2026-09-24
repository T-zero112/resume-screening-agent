import { z } from "zod";

import { ConfidenceSchema, DateRangeSchema, EvidenceRefSchema } from "./common.js";

export const FactKindSchema = z.enum([
  "education",
  "employment",
  "project",
  "skill",
  "certificate",
  "achievement",
  "domain_experience",
  "language",
  "job_preference",
  "award",
  "publication",
  "patent",
  "open_source",
  "timeline",
  "other",
]);
export type FactKind = z.infer<typeof FactKindSchema>;

export const FactDerivationTypeSchema = z.enum(["direct", "inferred"]);
export type FactDerivationType = z.infer<typeof FactDerivationTypeSchema>;

export const FactSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  kind: FactKindSchema,
  derivationType: FactDerivationTypeSchema.default("direct"),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  dateRange: DateRangeSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  evidenceRefs: z.array(EvidenceRefSchema).min(1),
  inferenceBasis: z.string().optional(),
  scoreEligible: z.boolean().default(false),
  confidence: ConfidenceSchema.default(0.5),
  createdAt: z.string().datetime(),
}).superRefine((fact, ctx) => {
  if (fact.derivationType === "inferred" && !fact.inferenceBasis) {
    ctx.addIssue({
      code: "custom",
      message: "Inferred facts must include inferenceBasis.",
      path: ["inferenceBasis"],
    });
  }
});
export type Fact = z.infer<typeof FactSchema>;
