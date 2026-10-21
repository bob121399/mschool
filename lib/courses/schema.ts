import { z } from "zod";

// Draft editor payload (PATCH /api/hr/courses/[id]). Bounds mirror the SQL validators; the DB is
// still the final authority (rubric/quiz triggers, lesson limits, tenant FKs).
export const criterionInput = z.object({
  id: z.string().trim().min(1).max(16), description: z.string().trim().min(1).max(1000),
  max_points: z.number().int().min(1).max(100), critical: z.boolean(),
  min_points: z.number().int().min(0).max(100), reference: z.string().trim().min(1).max(2000),
}).strict();
export const quizInput = z.object({
  question: z.string().trim().min(1).max(2000),
  options: z.array(z.object({ id: z.string().trim().min(1).max(8), label: z.string().trim().min(1).max(500) }).strict()).min(2).max(6),
  correct_option_id: z.string().min(1).max(8),
  explanation: z.string().trim().min(1).max(2000),
}).strict();
export const lessonInput = z.object({
  title: z.string().trim().min(1).max(300),
  learning_outcome: z.string().max(2000).default(""),
  content: z.string().min(1).max(24000),
  requires_assessment: z.boolean(),
  assessment_question: z.string().max(6000).default(""),
  source_chunk_ids: z.array(z.uuid()).max(20).default([]),
  rubric: z.object({ criteria: z.array(criterionInput).min(1).max(20), passing_score: z.number().int().min(1).max(100) }).strict().nullable(),
  quiz: z.array(quizInput).max(5).default([]),
}).strict();
export const moduleInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(4000).default(""),
  lessons: z.array(lessonInput).min(1).max(60),
}).strict();
export const draftPayload = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(4000).optional(),
  target_grade: z.enum(["junior", "middle", "senior", "head"]).optional(),
  objectives: z.array(z.string().max(500)).max(20).optional(),
  coverage_gaps: z.array(z.string().max(1000)).max(30).optional(),
  modules: z.array(moduleInput).min(1).max(12).optional(),
}).strict();
export type DraftPayload = z.infer<typeof draftPayload>;
export type LessonInput = z.infer<typeof lessonInput>;
export type ModuleInput = z.infer<typeof moduleInput>;
