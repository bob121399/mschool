import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { rubricProblems } from "@/lib/ai/contracts";
import { COURSE_CREATOR_PROMPT, courseDraftOutput, type CourseDraft } from "@/prompts";
import { PermanentJobError, TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";

const BATCH_CHARS = 40_000;

type Payload = { document_ids: string[]; grade: CourseDraft["grade"]; title: string; max_modules: number; max_lessons: number; prompt_version: string };

// Course generation: approved excerpts of THIS tenant only, bounded batches, code-side assembly and
// validation, DRAFT only (publication remains a human action).
export async function courseCreator(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const p = ctx.job.payload as unknown as Payload;
  if (p.prompt_version !== COURSE_CREATOR_PROMPT.version) throw new PermanentJobError("PROMPT_VERSION_MISMATCH");
  const model = modelEnv("OPENAI_WORKER_MODEL");
  const chunks = await ctx.db.from("document_chunks")
    .select("id,document_id,page,content,chunk_index,documents!inner(title,status,tenant_id)")
    .in("document_id", p.document_ids).eq("tenant_id", ctx.job.tenant_id as string)
    .eq("documents.status", "approved").order("document_id").order("chunk_index").limit(5000);
  if (chunks.error) throw new TransientJobError("DATABASE_UNAVAILABLE");
  if (!chunks.data?.length) throw new PermanentJobError("SOURCE_NOT_APPROVED");
  const excerpts = chunks.data.map((c) => ({ chunk_id: c.id, document_title: (c.documents as { title: string }).title,
    page: c.page, content: c.content }));
  const batches: (typeof excerpts)[] = [];
  let current: typeof excerpts = [];
  let size = 0;
  for (const e of excerpts) {
    if (size + e.content.length > BATCH_CHARS && current.length) { batches.push(current); current = []; size = 0; }
    current.push(e);
    size += e.content.length;
  }
  if (current.length) batches.push(current);
  const perBatchModules = Math.max(1, Math.floor(p.max_modules / batches.length));
  const perBatchLessons = Math.max(1, Math.floor(p.max_lessons / batches.length));
  const drafts: CourseDraft[] = [];
  const usage = { input_tokens: 0, output_tokens: 0, unknown_calls: 0 };
  for (const batch of batches) {
    const generated = await responseJSON({
      model, instructions: COURSE_CREATOR_PROMPT.instructions, schemaName: COURSE_CREATOR_PROMPT.schemaName,
      jsonSchema: COURSE_CREATOR_PROMPT.jsonSchema, validator: courseDraftOutput,
      maxOutputTokens: COURSE_CREATOR_PROMPT.maxOutputTokens, timeoutMs: 120_000,
      input: { grade: p.grade, title: p.title, limits: { max_modules: perBatchModules, max_lessons: perBatchLessons }, excerpts: batch },
    });
    if (generated.usage) { usage.input_tokens += generated.usage.input_tokens; usage.output_tokens += generated.usage.output_tokens; }
    else usage.unknown_calls += 1;
    drafts.push(generated.value);
    await ctx.db.rpc("heartbeat_job", { p_job: ctx.job.id, p_lease: ctx.lease });
  }
  const allowed = new Set(excerpts.map((e) => e.chunk_id));
  const gaps = new Set<string>();
  const modules: unknown[] = [];
  let lessonCount = 0;
  for (const d of drafts) {
    d.coverage_gaps.forEach((g) => gaps.add(g));
    for (const m of d.modules) {
      if (modules.length >= p.max_modules) { gaps.add("Часть материала не вошла: достигнут лимит модулей."); break; }
      const lessons = [];
      for (const l of m.lessons) {
        if (lessonCount >= p.max_lessons) { gaps.add("Часть материала не вошла: достигнут лимит уроков."); break; }
        if (l.source_chunk_ids.some((id) => !allowed.has(id))) throw new TransientJobError("AI_SCHEMA_MISMATCH");
        if (rubricProblems(l.rubric).length > 0) throw new TransientJobError("AI_SCHEMA_MISMATCH");
        if (!l.quiz.every((q) => q.options.some((o) => o.id === q.correct_option_id))) throw new TransientJobError("AI_SCHEMA_MISMATCH");
        lessonCount += 1;
        lessons.push({ title: l.title, learning_outcome: l.learning_outcome,
          content: l.example ? `${l.explanation}\n\n**Пример.** ${l.example}` : l.explanation,
          requires_assessment: true, assessment_question: l.assessment_question, source_chunk_ids: l.source_chunk_ids,
          rubric: l.rubric, quiz: l.quiz });
      }
      if (lessons.length) modules.push({ title: m.title, description: m.description, lessons });
    }
  }
  if (!modules.length) throw new PermanentJobError("EMPTY_DRAFT", "needs_review");
  const first = drafts[0]!;
  const created = await ctx.db.rpc("create_generated_course", { p_job: ctx.job.id, p_lease: ctx.lease, p_payload: {
    course_title: first.course_title || p.title, description: first.description,
    objectives: drafts.flatMap((d) => d.objectives).slice(0, 20), coverage_gaps: [...gaps].slice(0, 30), modules,
  } as never });
  if (created.error) {
    if (["STALE_LEASE", "TENANT_INACTIVE", "ACTOR_INACTIVE", "SOURCE_NOT_APPROVED"].includes(created.error.message)) {
      throw new PermanentJobError(created.error.message);
    }
    throw new PermanentJobError(created.error.message.slice(0, 80), "needs_review");
  }
  await recordAgentRun(ctx, "course_creator", { model, prompt_version: COURSE_CREATOR_PROMPT.version, batches: batches.length,
    usage, course_id: created.data, status: "needs_review" }, started);
  return { status: "needs_review", result: { course_id: created.data, coverage_gaps: [...gaps].slice(0, 30) } };
}
