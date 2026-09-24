import { z } from "zod";

import { ConfidenceSchema, EvidenceRefSchema } from "./common.js";
import { FactDerivationTypeSchema } from "./fact.js";
import { ScoringFieldPolicySchema } from "./scoring-boundary.js";

export const FeatureGroupSchema = z.enum([
  "skill",
  "experience",
  "project",
  "education",
  "language",
  "preference",
  "achievement",
  "credential",
  "domain",
  "timeline",
  "other",
]);
export type FeatureGroup = z.infer<typeof FeatureGroupSchema>;

export const FeatureValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type FeatureValue = z.infer<typeof FeatureValueSchema>;

export const FeatureSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/, {
    message: "Feature keys must use stable dotted notation, for example skill.typescript.exists.",
  }),
  group: FeatureGroupSchema,
  label: z.string().optional(),
  displayValue: z.string().optional(),
  value: FeatureValueSchema,
  valueType: z.enum(["string", "number", "boolean", "string_array", "null"]),
  scorePolicy: ScoringFieldPolicySchema.default("jd_dependent"),
  derivationType: FactDerivationTypeSchema.default("direct"),
  derivationNote: z.string().min(1),
  sourceFactIds: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  jdRequirementRefs: z.array(z.string()).default([]),
  confidence: ConfidenceSchema.default(0.5),
}).superRefine((feature, ctx) => {
  if (feature.scorePolicy === "jd_dependent" || feature.scorePolicy === "scorable") {
    if (feature.sourceFactIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Score candidate features must include sourceFactIds.",
        path: ["sourceFactIds"],
      });
    }

    if (feature.evidenceRefs.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Score candidate features must include evidenceRefs.",
        path: ["evidenceRefs"],
      });
    }
  }
});
export type Feature = z.infer<typeof FeatureSchema>;

export const CandidateFeatureSetSchema = z.object({
  candidateId: z.string().min(1),
  schemaVersion: z.literal("candidate-features.v1"),
  features: z.array(FeatureSchema),
  generatedAt: z.string().datetime(),
  generatorVersion: z.string().optional(),
});
export type CandidateFeatureSet = z.infer<typeof CandidateFeatureSetSchema>;
