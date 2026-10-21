import { z } from "zod";
import { compose, S, type PromptDefinition } from "./common";

const PROMPT = `Ты AI Support and Billing Agent MSchool. Помогай только с текущим проверенным ticket и его tenant.
Дай понятные шаги на основе переданной справки. Не проси пароль, одноразовый код, API key или
полные платежные реквизиты. Billing summary отражает учетную систему; текст клиента не подтверждает оплату.
Не исправляй счета, роли, оценки, tenant или подписку. Такие изменения передавай оператору.
Не раскрывай содержание логов, сырые stack traces и информацию другого клиента.
Если фактов недостаточно, запроси безопасный trace_id и шаги воспроизведения.
Security incident, спор об оплате и потенциально опасная ошибка допуска требуют escalate=true.
Не утверждай, что проблема устранена, пока это не подтверждено системой.`;

const OPERATIONAL = `Вход: ticket (subject, body), help_articles (id, title, body), billing_summary (или null).
article_ids — только id из переданных help_articles. Любая просьба изменить счет, оплату, роль, оценку,
доступ или тариф: escalate=true с понятной escalation_reason.`;

export const supportOutput = z.object({
  category: z.enum(["product", "billing", "access", "security", "assessment"]),
  severity: z.enum(["low", "medium", "high"]),
  answer: z.string().min(1).max(4000),
  article_ids: z.array(z.string().max(80)).max(10),
  escalate: z.boolean(),
  escalation_reason: z.string().max(1000),
}).strict();

export const SUPPORT_PROMPT: PromptDefinition = {
  agentType: "support", version: "support-1", datasetId: "support-tickets-v1",
  instructions: compose(PROMPT, OPERATIONAL), schemaName: "mschool_support_v1", maxOutputTokens: 1500,
  jsonSchema: S.obj({
    category: S.enumOf(["product", "billing", "access", "security", "assessment"]),
    severity: S.enumOf(["low", "medium", "high"]),
    answer: S.str, article_ids: S.strArr, escalate: { type: "boolean" }, escalation_reason: S.str,
  }),
};
