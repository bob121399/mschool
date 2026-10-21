import { z } from "zod";
import { randomUUID } from "node:crypto";
import { employeeContext, lessonContextSchema } from "@/lib/auth/context";
import { adminDb } from "@/lib/supabase/admin";
import { requireOrigin, readJson, databaseError, HttpError, json, publicError } from "@/lib/http";
import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { assessmentResult, rubricSchema, evaluationOutput, evaluationJSONSchema } from "@/lib/ai/contracts";
import { ASSESSOR_PROMPT, ASSESSOR_PROMPT_VERSION } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const requestSchema = z.object({
  assignmentId: z.uuid(), lessonId: z.uuid(), requestId: z.uuid(),
  answer: z.string().trim().min(1).max(12000),
}).strict();
const reservationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("succeeded"), result: assessmentResult }),
  z.object({ state: z.literal("running"), attempt_id: z.uuid(), lease_token: z.uuid(),
    rubric_id: z.uuid(), tenant_id: z.uuid(), user_id: z.uuid() }),
]);

export async function POST(request: Request) {
  const started = Date.now();
  const traceId = randomUUID();
  let reservation: { attempt_id: string; lease_token: string } | undefined;
  try {
    requireOrigin(request);
    const body = requestSchema.parse(await readJson(request));
    const { db, userId, tenantId } = await employeeContext();
    // Not configured → explicit 503 before an attempt is reserved (no score, no attempt quota used).
    const model = modelEnv("OPENAI_ASSESSOR_MODEL");
    const { data: startData, error: startError } = await db.rpc("begin_assessment", {
      p_assignment: body.assignmentId, p_lesson: body.lessonId,
      p_request_key: body.requestId, p_answer: body.answer,
    });
    if (startError) databaseError(startError);
    const start = reservationSchema.safeParse(startData);
    if (!start.success) throw new HttpError(503, "INVALID_ATTEMPT_DATA");
    if (start.data.state === "succeeded") return json(start.data.result);
    if (start.data.tenant_id !== tenantId || start.data.user_id !== userId) throw new HttpError(403, "FORBIDDEN");
    reservation = start.data;
    const { data: contextData, error: contextError } = await db.rpc("lesson_context", {
      p_assignment: body.assignmentId, p_lesson: body.lessonId,
    });
    if (contextError) databaseError(contextError);
    const ctx = lessonContextSchema.safeParse(contextData);
    if (!ctx.success) throw new HttpError(503, "INVALID_LESSON_DATA");
    const admin = adminDb();
    const { data: rubricData, error: rubricError } = await admin.from("assessment_rubrics")
      .select("criteria,passing_score").eq("id", start.data.rubric_id)
      .eq("tenant_id", tenantId).eq("lesson_id", body.lessonId).single();
    if (rubricError) databaseError(rubricError);
    const rubric = rubricSchema.safeParse(rubricData);
    if (!rubric.success) throw new HttpError(503, "INVALID_RUBRIC_DATA");
    const ids = rubric.data.criteria.map((c) => c.id);
    if (new Set(ids).size !== ids.length || rubric.data.criteria.reduce((sum, c) => sum + c.max_points, 0) !== 100) {
      throw new HttpError(503, "INVALID_RUBRIC_DATA");
    }
    const generated = await responseJSON({
      model, instructions: ASSESSOR_PROMPT, schemaName: "mschool_assessor_v1",
      jsonSchema: evaluationJSONSchema(ids), validator: evaluationOutput, maxOutputTokens: 5000,
      input: { question: ctx.data.assessment_question, rubric: rubric.data, answer: body.answer },
    });
    if (generated.value.criteria.length !== ids.length
      || new Set(generated.value.criteria.map((c) => c.id)).size !== ids.length) {
      throw new HttpError(502, "AI_CRITERION_MISMATCH");
    }
    for (const item of generated.value.criteria) {
      const rule = rubric.data.criteria.find((c) => c.id === item.id);
      if (!rule || item.points > rule.max_points || (item.points > 0 && item.evidence === "")
        || (item.evidence !== "" && !body.answer.includes(item.evidence))) {
        throw new HttpError(502, "AI_INVALID_EVIDENCE");
      }
    }
    const { data: finalData, error: finalError } = await admin.rpc("finish_assessment", {
      p_attempt: start.data.attempt_id, p_lease: start.data.lease_token,
      p_evaluation: generated.value,
      p_meta: { trace_id: traceId, model, response_id: generated.responseId,
        prompt_version: ASSESSOR_PROMPT_VERSION, usage: generated.usage },
      p_execution_ms: Date.now() - started,
    });
    if (finalError) databaseError(finalError);
    const final = assessmentResult.safeParse(finalData);
    if (!final.success) throw new HttpError(503, "INVALID_RESULT_DATA");
    return json(final.data);
  } catch (error) {
    if (reservation) {
      try {
        const { error: markError } = await adminDb().rpc("fail_assessment", {
          p_attempt: reservation.attempt_id, p_lease: reservation.lease_token,
          p_code: error instanceof HttpError ? error.code : "INTERNAL_ERROR",
        });
        if (markError) console.error(JSON.stringify({ trace_id: traceId, code: "FAILURE_RECORD_UNAVAILABLE" }));
      } catch {
        console.error(JSON.stringify({ trace_id: traceId, code: "FAILURE_RECORD_UNAVAILABLE" }));
      }
    }
    return publicError(error, traceId);
  }
}
