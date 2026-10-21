import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { customerRoi, PRICE_CATALOG } from "@/lib/billing/metrics";
import { SALES_PROMPT, salesOutput } from "@/prompts";
import { salesTextProblems } from "@/lib/ai/guards";
import { PermanentJobError, TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";
import type { Json } from "@/lib/database.types";

type LeadInputs = { baseline_hours?: number; hourly_cost_usd?: number; automation_share?: number; control_hours?: number;
  cash_realization?: number; subscription_usd?: number; implementation_usd?: number };

// ROI numbers come from the code calculator, never from the model (3.2).
export async function sales(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const leadId = String((ctx.job.payload as { lead_id?: string }).lead_id ?? "");
  const lead = await ctx.db.from("leads").select("id,company_name,qualification,status,consent_at").eq("id", leadId).single();
  if (lead.error || !lead.data) throw new PermanentJobError("NOT_FOUND");
  const inputs = ((lead.data.qualification as { inputs?: LeadInputs } | null)?.inputs ?? {}) as LeadInputs;
  let roi: ReturnType<typeof customerRoi> | null = null;
  if (inputs.baseline_hours !== undefined && inputs.hourly_cost_usd !== undefined && inputs.automation_share !== undefined
    && inputs.control_hours !== undefined && inputs.cash_realization !== undefined && inputs.subscription_usd !== undefined) {
    try {
      roi = customerRoi({ operations: [{ baseline_hours: inputs.baseline_hours, hourly_cost: inputs.hourly_cost_usd,
        automation_share: inputs.automation_share, control_hours: inputs.control_hours, cash_realization: inputs.cash_realization }],
        contractor_savings: 0, subscription: inputs.subscription_usd, extra_operations: 0, implementation: inputs.implementation_usd ?? 0 });
    } catch { roi = null; }
  }
  const model = modelEnv("OPENAI_WORKER_MODEL");
  const generated = await responseJSON({ model, instructions: SALES_PROMPT.instructions, schemaName: SALES_PROMPT.schemaName,
    jsonSchema: SALES_PROMPT.jsonSchema, validator: salesOutput, maxOutputTokens: SALES_PROMPT.maxOutputTokens,
    input: { lead: { company_name: lead.data.company_name, ...inputs }, price_catalog: PRICE_CATALOG, roi } });
  if (salesTextProblems(generated.value.summary).length > 0) throw new TransientJobError("AI_SCHEMA_MISMATCH");
  const dto = { ...generated.value, roi, inputs, model, prompt_version: SALES_PROMPT.version, qualified_at: new Date().toISOString() };
  const saved = await ctx.db.rpc("save_lead_qualification", { p_job: ctx.job.id, p_lease: ctx.lease, p_dto: dto as unknown as Json });
  if (saved.error) throw new TransientJobError(saved.error.message);
  await recordAgentRun(ctx, "sales", { model, prompt_version: SALES_PROMPT.version, usage: generated.usage, lead_id: leadId }, started);
  return { status: "succeeded", result: { lead_id: leadId, qualification: generated.value.qualification } };
}
