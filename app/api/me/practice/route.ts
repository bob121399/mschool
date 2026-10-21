import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Formative MCQ: options without answer key; checking is deterministic SQL; progress unchanged.
export const GET = route(async (request) => {
  const params = searchParams(request);
  const assignmentId = z.uuid().parse(params.get("assignmentId"));
  const lessonId = z.uuid().parse(params.get("lessonId"));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("practice_questions", { p_assignment: assignmentId, p_lesson: lessonId });
  if (error) databaseError(error);
  return json({ questions: data });
}, { mutation: false });

const body = z.object({ assignmentId: z.uuid(), lessonId: z.uuid(), quizId: z.uuid(), optionId: z.string().min(1).max(64) }).strict();
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 2048));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("check_practice_answer", { p_assignment: input.assignmentId,
    p_lesson: input.lessonId, p_quiz: input.quizId, p_option: input.optionId });
  if (error) databaseError(error);
  return json(data);
}, { mutation: true });
