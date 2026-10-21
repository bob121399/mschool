import { z } from "zod";
import { randomUUID } from "node:crypto";
import { employeeContext, lessonContextSchema } from "@/lib/auth/context";
import { adminDb } from "@/lib/supabase/admin";
import { requireOrigin, readJson, databaseError, HttpError, json, publicError } from "@/lib/http";
import { embedding, modelEnv, responseJSON } from "@/lib/ai/openai";
import { tutorJSONSchema, tutorOutput } from "@/lib/ai/contracts";
import { TUTOR_PROMPT, TUTOR_PROMPT_VERSION } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const requestSchema = z.object({
  assignmentId: z.uuid(), lessonId: z.uuid(), question: z.string().trim().min(1).max(2000),
}).strict();
const chunkSchema = z.array(z.object({
  chunk_id: z.uuid(), document_id: z.uuid(), title: z.string(), page: z.number().int(),
  content: z.string(), similarity: z.number().finite(),
}));

export async function POST(request: Request) {
  const started = Date.now();
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const body = requestSchema.parse(await readJson(request));
    const { db, userId, tenantId } = await employeeContext();
    const { data: contextData, error: contextError } = await db.rpc("lesson_context", {
      p_assignment: body.assignmentId, p_lesson: body.lessonId,
    });
    if (contextError) databaseError(contextError);
    const ctx = lessonContextSchema.safeParse(contextData);
    if (!ctx.success || ctx.data.tenant_id !== tenantId || ctx.data.user_id !== userId) {
      throw new HttpError(404, "NOT_FOUND");
    }
    // Fail fast before consuming quota when the provider is not configured (no mock fallback).
    const model = modelEnv("OPENAI_TUTOR_MODEL");
    const { error: quotaError } = await db.rpc("consume_ai_quota", { p_kind: "tutor" });
    if (quotaError) databaseError(quotaError);
    const query = await embedding(body.question);
    const { data: chunkData, error: chunkError } = await db.rpc("match_lesson_chunks", {
      p_assignment: body.assignmentId, p_lesson: body.lessonId, p_embedding: query.vector,
      p_model: query.model, p_limit: 5,
    });
    if (chunkError) databaseError(chunkError);
    const chunks = chunkSchema.safeParse(chunkData);
    if (!chunks.success) throw new HttpError(503, "INVALID_RETRIEVAL_DATA");
    const sources = chunks.data.filter((row) => row.similarity >= 0.25).map((row) => ({
      source_id: row.chunk_id, document_id: row.document_id,
      title: row.title, page: row.page, content: row.content.slice(0, 4000),
    }));
    const { data: history, error: historyError } = await db.from("tutor_exchanges")
      .select("question,answer").eq("tenant_id", tenantId).eq("user_id", userId)
      .eq("assignment_id", body.assignmentId).eq("lesson_id", body.lessonId)
      .order("created_at", { ascending: false }).limit(3);
    if (historyError) databaseError(historyError);
    const lessonSource = `lesson:${body.lessonId}`;
    const generated = await responseJSON({
      model, instructions: TUTOR_PROMPT, schemaName: "mschool_tutor_v1",
      jsonSchema: tutorJSONSchema, validator: tutorOutput, maxOutputTokens: 2500,
      input: {
        grade: ctx.data.grade,
        lesson: { source_id: lessonSource, title: ctx.data.title, content: ctx.data.content },
        assessment_question: ctx.data.assessment_question,
        sources, history: [...(history ?? [])].reverse().map((item) => ({
          question: item.question, answer: item.answer.slice(0, 4000),
        })), question: body.question,
      },
    });
    const allowed = new Map<string, { source_id: string; title: string; page: number | null }>([
      [lessonSource, { source_id: lessonSource, title: ctx.data.title, page: null }],
      ...sources.map((s): [string, { source_id: string; title: string; page: number | null }] =>
        [s.source_id, { source_id: s.source_id, title: s.title, page: s.page }]),
    ]);
    const ids = [...new Set(generated.value.source_ids)];
    if (ids.some((id) => !allowed.has(id)) || (!generated.value.insufficient_context && ids.length === 0)) {
      throw new HttpError(502, "AI_INVALID_CITATIONS");
    }
    const citations = ids.map((id) => allowed.get(id)!);
    const { data: exchangeId, error: saveError } = await adminDb().rpc("record_tutor_exchange", {
      p_tenant: tenantId, p_user: userId, p_assignment: body.assignmentId, p_lesson: body.lessonId,
      p_question: body.question, p_answer: generated.value.answer, p_citations: citations,
      p_meta: { trace_id: traceId, model, response_id: generated.responseId,
        prompt_version: TUTOR_PROMPT_VERSION, usage: generated.usage, embedding_usage: query.usage },
      p_execution_ms: Date.now() - started,
    });
    if (saveError) databaseError(saveError);
    return json({ answer: generated.value.answer, citations,
      insufficient_context: generated.value.insufficient_context, exchange_id: exchangeId });
  } catch (error) {
    return publicError(error, traceId);
  }
}
