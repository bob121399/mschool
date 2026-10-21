import { aiConfigured } from "@/lib/config";
import { modelEnv, responseJSON } from "@/lib/ai/openai";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { SUPPORT_PROMPT, supportOutput } from "@/prompts";
import { supportTextProblems } from "@/lib/ai/guards";
import { PermanentJobError, TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";
import type { Json } from "@/lib/database.types";

// Requests that change money, access, grades or tenants always go to a human operator.
const FORCE_ESCALATE = /(оплат|счет|счёт|возврат|refund|paid|скидк|роль|доступ|балл|оценк|утечк|взлом|пароль)/iu;

export async function support(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const ticketId = String((ctx.job.payload as { ticket_id?: string }).ticket_id ?? "");
  const t = await ctx.db.from("support_tickets").select("id,subject,body,tenant_id").eq("id", ticketId)
    .eq("tenant_id", ctx.job.tenant_id as string).single();
  if (t.error || !t.data) throw new PermanentJobError("NOT_FOUND");
  const forced = FORCE_ESCALATE.test(`${t.data.subject} ${t.data.body}`);
  let reply: Record<string, unknown>;
  if (!aiConfigured()) {
    reply = { source: "system", category: null, severity: forced ? "high" : "medium",
      answer: "Обращение зарегистрировано и передано оператору поддержки. Автоматический ответ сейчас недоступен.",
      article_ids: [], escalate: true, escalation_reason: "AI_NOT_CONFIGURED" };
  } else {
    const [sub, invoices] = await Promise.all([
      ctx.db.from("subscriptions").select("status,tier,currency,period_start,period_end").eq("tenant_id", t.data.tenant_id)
        .order("period_start", { ascending: false }).limit(1),
      ctx.db.from("invoices").select("period_start,status,amount_minor,currency").eq("tenant_id", t.data.tenant_id)
        .order("period_start", { ascending: false }).limit(3),
    ]);
    const model = modelEnv("OPENAI_WORKER_MODEL");
    const generated = await responseJSON({ model, instructions: SUPPORT_PROMPT.instructions, schemaName: SUPPORT_PROMPT.schemaName,
      jsonSchema: SUPPORT_PROMPT.jsonSchema, validator: supportOutput, maxOutputTokens: SUPPORT_PROMPT.maxOutputTokens,
      input: { ticket: { subject: t.data.subject, body: t.data.body }, help_articles: HELP_ARTICLES,
        billing_summary: { subscription: sub.data?.[0] ?? null, recent_invoices: invoices.data ?? [] } } });
    if (supportTextProblems(generated.value.answer).length > 0) throw new TransientJobError("AI_SCHEMA_MISMATCH");
    const known = new Set<string>(HELP_ARTICLES.map((a) => a.id));
    if (generated.value.article_ids.some((id) => !known.has(id))) throw new TransientJobError("AI_SCHEMA_MISMATCH");
    reply = { source: "agent", model, prompt_version: SUPPORT_PROMPT.version, ...generated.value,
      escalate: generated.value.escalate || forced,
      escalation_reason: generated.value.escalate ? generated.value.escalation_reason
        : forced ? "Запрос касается оплаты, доступа или оценки — решение принимает оператор." : "" };
    await recordAgentRun(ctx, "support", { model, prompt_version: SUPPORT_PROMPT.version, usage: generated.usage,
      response_id: generated.responseId, escalate: reply.escalate }, started);
  }
  const saved = await ctx.db.rpc("record_support_reply", { p_job: ctx.job.id, p_lease: ctx.lease, p_reply: reply as Json });
  if (saved.error) throw new TransientJobError(saved.error.message);
  return { status: "succeeded", result: { ticket_id: ticketId, escalated: reply.escalate as boolean } };
}
