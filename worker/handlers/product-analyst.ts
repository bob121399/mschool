import { aiConfigured } from "@/lib/config";
import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { ANALYTICS_TEMPLATES } from "@/lib/analytics";
import { PRODUCT_ANALYST_PROMPT, productAnalystOutput } from "@/prompts";
import { PermanentJobError, TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";
import type { Json } from "@/lib/database.types";

// The model only reads aggregate rows of an allowlisted template; it never writes SQL.
export async function productAnalyst(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const p = ctx.job.payload as { template_id: string; period_start: string; period_end: string };
  const template = ANALYTICS_TEMPLATES[p.template_id];
  if (!template) throw new PermanentJobError("INVALID_TEMPLATE");
  const rows = await ctx.db.rpc("analytics_template", { p_template: p.template_id, p_start: p.period_start, p_end: p.period_end });
  if (rows.error) throw new TransientJobError("DATABASE_UNAVAILABLE");
  let report: Json = { status: "not_generated", reason: "AI_NOT_CONFIGURED" };
  if (aiConfigured()) {
    const model = modelEnv("OPENAI_WORKER_MODEL");
    const generated = await responseJSON({ model, instructions: PRODUCT_ANALYST_PROMPT.instructions,
      schemaName: PRODUCT_ANALYST_PROMPT.schemaName, jsonSchema: PRODUCT_ANALYST_PROMPT.jsonSchema,
      validator: productAnalystOutput, maxOutputTokens: PRODUCT_ANALYST_PROMPT.maxOutputTokens,
      input: { template_id: p.template_id, definition: template.definition, period: { start: p.period_start, end: p.period_end }, rows: rows.data } });
    report = { status: "generated", model, prompt_version: PRODUCT_ANALYST_PROMPT.version, ...generated.value } as Json;
    await recordAgentRun(ctx, "product_analyst", { model, prompt_version: PRODUCT_ANALYST_PROMPT.version, usage: generated.usage,
      response_id: generated.responseId, template_id: p.template_id }, started);
  }
  return { status: "succeeded", result: { template_id: p.template_id, definition: template.definition, data: rows.data, report } };
}
