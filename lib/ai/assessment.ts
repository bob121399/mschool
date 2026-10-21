import type { z } from "zod";
import type { evaluationOutput, rubricSchema } from "@/lib/ai/contracts";

type Rubric = z.infer<typeof rubricSchema>;
type Evaluation = z.infer<typeof evaluationOutput>;

/** Server-side checks of the model's per-criterion evaluation before the SQL commit (spec 3.7/5.3):
 * exactly one result per criterion, points ≤ max, points > 0 require evidence, evidence must be a
 * verbatim quote of the learner's answer. Returns an error code or null. */
/** Verbatim comparison tolerant only to letter case and whitespace runs (decision D-11). */
export function normalizeQuote(text: string): string {
  return text.toLocaleLowerCase("ru").replace(/\s+/gu, " ").trim();
}

export function evaluationProblem(rubric: Rubric, answer: string, evaluation: Evaluation): "AI_CRITERION_MISMATCH" | "AI_INVALID_EVIDENCE" | null {
  const ids = rubric.criteria.map((c) => c.id);
  if (evaluation.criteria.length !== ids.length || new Set(evaluation.criteria.map((c) => c.id)).size !== ids.length) {
    return "AI_CRITERION_MISMATCH";
  }
  const normalizedAnswer = normalizeQuote(answer);
  for (const item of evaluation.criteria) {
    const rule = rubric.criteria.find((c) => c.id === item.id);
    if (!rule || item.points > rule.max_points || (item.points > 0 && item.evidence === "")
      || (item.evidence !== "" && !normalizedAnswer.includes(normalizeQuote(item.evidence)))) {
      return "AI_INVALID_EVIDENCE";
    }
  }
  return null;
}

/** Mirror of finish_assessment scoring, used ONLY for eval reporting. The authoritative result is
 * computed in SQL (public.finish_assessment). */
export function scoreForEval(rubric: Rubric, evaluation: Evaluation): { passed: boolean; score: number } {
  let total = 0;
  let gates = true;
  for (const c of rubric.criteria) {
    const p = evaluation.criteria.find((e) => e.id === c.id)?.points ?? 0;
    total += p;
    if (c.critical && p < c.min_points) gates = false;
  }
  return { passed: gates && total >= rubric.passing_score, score: total };
}
