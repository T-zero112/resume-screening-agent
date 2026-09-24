import { z } from "zod";

export const JobStatusSchema = z.enum(["draft", "standard_generated", "confirmed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSourceSchema = z.enum(["manual", "imported", "generated"]);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const JobSchema = z.object({
  schemaVersion: z.literal("job.v1"),
  id: z.string().min(1),
  title: z.string().min(1),
  jdText: z.string().min(1),
  source: JobSourceSchema.default("manual"),
  status: JobStatusSchema.default("draft"),
  archivedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Job = z.infer<typeof JobSchema>;
