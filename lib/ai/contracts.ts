import { z } from "zod";

export const tutorOutput = z.object({
  answer: z.string().min(1).max(12000),
  source_ids: z.array(z.string().max(80)).max(6),
  insufficient_context: z.boolean(),
}).strict();
export const tutorJSONSchema = {
  type: "object", additionalProperties: false,
  properties: {
    answer: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
    insufficient_context: { type: "boolean" },
  },
  required: ["answer", "source_ids", "insufficient_context"],
};
export const criterionSchema = z.object({
  id: z.string().min(1), description: z.string().min(1),
  max_points: z.number().int().positive().max(100), critical: z.boolean(),
  min_points: z.number().int().nonnegative().max(100), reference: z.string().min(1),
}).strict();
export const rubricSchema = z.object({
  criteria: z.array(criterionSchema).min(1).max(20), passing_score: z.number().int().min(1).max(100),
});
export const evaluationOutput = z.object({
  criteria: z.array(z.object({
    id: z.string(), points: z.number().int().min(0).max(100),
    evidence: z.string().max(2000), feedback: z.string().max(2000),
  }).strict()).min(1).max(20),
  feedback: z.string().min(1).max(6000),
}).strict();
export function evaluationJSONSchema(ids: string[]) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      criteria: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string", enum: ids }, points: { type: "integer" },
          evidence: { type: "string" }, feedback: { type: "string" },
        }, required: ["id", "points", "evidence", "feedback"],
      } },
      feedback: { type: "string" },
    }, required: ["criteria", "feedback"],
  };
}
export const assessmentResult = z.object({
  passed: z.boolean(), score: z.number().int().min(0).max(100), feedback: z.string(),
}).strict();

/** Rubric invariants shared by the editor, the generator and the assessor (DB re-validates). */
export function rubricProblems(rubric: z.infer<typeof rubricSchema>): string[] {
  const problems: string[] = [];
  const ids = rubric.criteria.map((c) => c.id);
  if (new Set(ids).size !== ids.length) problems.push("DUPLICATE_CRITERION_ID");
  const total = rubric.criteria.reduce((sum, c) => sum + c.max_points, 0);
  if (total !== 100) problems.push("WEIGHTS_MUST_SUM_100");
  for (const c of rubric.criteria) {
    if (c.min_points > c.max_points) problems.push(`MIN_GT_MAX:${c.id}`);
    if (c.critical && c.min_points === 0) problems.push(`CRITICAL_WITHOUT_MIN:${c.id}`);
  }
  return problems;
}
