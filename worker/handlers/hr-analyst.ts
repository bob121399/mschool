import { aiConfigured } from "@/lib/config";
import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { zonedMidnightToUtc } from "@/lib/time";
import { HR_ANALYST_PROMPT, hrAnalystOutput } from "@/prompts";
import { TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";
import type { Json } from "@/lib/database.types";

// Deterministic metrics are always stored; the narrative is generated only by a configured model and
// may not introduce numbers or departments absent from metrics.
export async function hrAnalyst(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const p = ctx.job.payload as { period_start: string; period_end: string; timezone: string };
  const start = zonedMidnightToUtc(p.period_start, p.timezone).toISOString();
  const end = zonedMidnightToUtc(p.period_end, p.timezone).toISOString();
  const m = await ctx.db.rpc("hr_report_metrics", { p_tenant: ctx.job.tenant_id as string, p_start: start, p_end: end });
  if (m.error) throw new TransientJobError("DATABASE_UNAVAILABLE");
  const metrics = m.data as { departments: { department_id: string }[] } & Record<string, unknown>;
  let narrative: Json = { status: "not_generated", reason: "AI_NOT_CONFIGURED" };
  if (aiConfigured()) {
    const model = modelEnv("OPENAI_WORKER_MODEL");
    const generated = await responseJSON({ model, instructions: HR_ANALYST_PROMPT.instructions, schemaName: HR_ANALYST_PROMPT.schemaName,
      jsonSchema: HR_ANALYST_PROMPT.jsonSchema, validator: hrAnalystOutput, maxOutputTokens: HR_ANALYST_PROMPT.maxOutputTokens,
      input: { period: { start: p.period_start, end: p.period_end, timezone: p.timezone }, metrics } });
    const known = new Set(metrics.departments.map((d) => d.department_id));
    if (generated.value.department_summaries.some((d) => !known.has(d.department_id))) throw new TransientJobError("AI_SCHEMA_MISMATCH");
    narrative = { status: "generated", model, prompt_version: HR_ANALYST_PROMPT.version, ...generated.value } as Json;
    await recordAgentRun(ctx, "hr_analyst", { model, prompt_version: HR_ANALYST_PROMPT.version, usage: generated.usage,
      response_id: generated.responseId }, started);
  }
  const stored = await ctx.db.rpc("store_hr_report", { p_job: ctx.job.id, p_lease: ctx.lease, p_metrics: metrics as Json, p_narrative: narrative });
  if (stored.error) throw new TransientJobError(stored.error.message);
  return { status: "succeeded", result: { report_id: stored.data } };
}
