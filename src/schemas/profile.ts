import { z } from "zod";

import {
  ConfidenceSchema,
  DateRangeSchema,
  EvidenceRefSchema,
  MissingStateSchema,
} from "./common.js";

export const ContactInfoSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.string().url()).default([]),
  missingState: MissingStateSchema.default("unknown"),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
});
export type ContactInfo = z.infer<typeof ContactInfoSchema>;

export const EducationExperienceSchema = z.object({
  school: z.string().optional(),
  degree: z.string().optional(),
  major: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  rawText: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type EducationExperience = z.infer<typeof EducationExperienceSchema>;

export const QuantifiedImpactSchema = z.object({
  metric: z.string().min(1),
  value: z.string().min(1),
  context: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type QuantifiedImpact = z.infer<typeof QuantifiedImpactSchema>;

export const WorkExperienceSchema = z.object({
  company: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  industry: z.string().optional(),
  businessDomains: z.array(z.string()).default([]),
  teamSize: z.string().optional(),
  managementScope: z.string().optional(),
  businessScale: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  quantifiedImpacts: z.array(QuantifiedImpactSchema).default([]),
  technologies: z.array(z.string()).default([]),
  rawText: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;

export const ProjectTypeSchema = z.enum(["company", "personal", "open_source", "academic", "other"]);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const ProjectExperienceSchema = z.object({
  name: z.string().optional(),
  type: ProjectTypeSchema.optional(),
  role: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  description: z.string().optional(),
  businessDomain: z.string().optional(),
  architecture: z.string().optional(),
  projectScale: z.string().optional(),
  personalContribution: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  quantifiedImpacts: z.array(QuantifiedImpactSchema).default([]),
  technologies: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type ProjectExperience = z.infer<typeof ProjectExperienceSchema>;

export const InferredProficiencySchema = z.object({
  level: z.enum(["beginner", "working", "proficient", "advanced", "expert", "unknown"]).default("unknown"),
  basis: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type InferredProficiency = z.infer<typeof InferredProficiencySchema>;

export const SkillSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    "programming_language",
    "framework",
    "database",
    "tool",
    "cloud",
    "devops",
    "testing",
    "ai_ml",
    "product",
    "design",
    "domain",
    "other",
  ]),
  normalizedName: z.string().optional(),
  inferredProficiency: InferredProficiencySchema.optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type Skill = z.infer<typeof SkillSchema>;

export const LanguageAbilitySchema = z.object({
  language: z.string().min(1),
  proficiency: z.enum(["basic", "working", "professional", "native", "unknown"]).default("unknown"),
  testName: z.string().optional(),
  score: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type LanguageAbility = z.infer<typeof LanguageAbilitySchema>;

export const CertificateSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type Certificate = z.infer<typeof CertificateSchema>;

export const AwardSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  level: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  description: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type Award = z.infer<typeof AwardSchema>;

export const PublicationSchema = z.object({
  title: z.string().min(1),
  venue: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  role: z.string().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type Publication = z.infer<typeof PublicationSchema>;

export const PatentSchema = z.object({
  title: z.string().min(1),
  patentNumber: z.string().optional(),
  status: z.string().optional(),
  dateRange: DateRangeSchema.optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type Patent = z.infer<typeof PatentSchema>;

export const OpenSourceContributionSchema = z.object({
  projectName: z.string().min(1),
  role: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type OpenSourceContribution = z.infer<typeof OpenSourceContributionSchema>;

export const JobPreferenceSchema = z.object({
  expectedTitles: z.array(z.string()).default([]),
  expectedLocations: z.array(z.string()).default([]),
  expectedSalary: z.string().optional(),
  availability: z.string().optional(),
  employmentTypes: z.array(z.enum(["full_time", "part_time", "internship", "contract", "remote"])).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type JobPreference = z.infer<typeof JobPreferenceSchema>;

export const TimelineItemSchema = z.object({
  type: z.enum(["education", "work", "project", "gap", "other"]),
  label: z.string().min(1),
  dateRange: DateRangeSchema.optional(),
  sourceIds: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const CandidateProfileSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal("candidate-profile.v1"),
  contactInfo: ContactInfoSchema,
  summary: z.string().optional(),
  education: z.array(EducationExperienceSchema).default([]),
  workExperience: z.array(WorkExperienceSchema).default([]),
  projectExperience: z.array(ProjectExperienceSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  certificates: z.array(CertificateSchema).default([]),
  awards: z.array(AwardSchema).default([]),
  publications: z.array(PublicationSchema).default([]),
  patents: z.array(PatentSchema).default([]),
  openSourceContributions: z.array(OpenSourceContributionSchema).default([]),
  languages: z.array(LanguageAbilitySchema).default([]),
  jobPreference: JobPreferenceSchema.optional(),
  timeline: z.array(TimelineItemSchema).default([]),
  otherJobRelatedInfo: z.array(z.string()).default([]),
  unresolvedItems: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
