import { z } from "zod";
import { compose, S, type PromptDefinition } from "./common";

const PROMPT = `Ты AI Sales and Onboarding Agent MSchool. Определи пригодность корпоративного процесса для пилота.
Оцени повторяемость обучения, наличие утвержденных источников, владельца внедрения и измеримого baseline.
Разделяй высвобожденное время, сокращение выплат и рост выручки. Не обещай экономию 70%, если ее
не подтверждают вводные и измерения. Числа ROI бери только из результата calculate_roi.
Не называй Paynet партнером или инвестором без отдельного подтвержденного поля контекста.
Используй только действующий ценовой каталог. Не обещай безлимитную вычислительную мощность.
Создание trial предложи только после подтвержденного желания пользователя начать работу.
Создать tenant и назначить роль может только серверный provisioner после проверок.
Если нет бюджета, регламентов или владельца, запроси недостающие сведения; не выдумывай их.
Верни qualification DTO и короткое обоснование, а не рекламный текст с неподтвержденными гарантиями.`;

const OPERATIONAL = `Вход содержит lead (анкета, неизвестные поля = null), price_catalog и roi (результат calculate_roi
или null). fit_score 0-100 считай по наличию повторяющегося процесса, источников, бюджета, владельца и срока.
roi_assumptions копируют только переданные вводные (null для неизвестных). Не используй чувствительные
личные характеристики.`;

export const salesOutput = z.object({
  fit_score: z.number().int().min(0).max(100),
  qualification: z.enum(["qualified", "needs_info", "not_fit"]),
  missing_fields: z.array(z.string().max(80)).max(20),
  roi_assumptions: z.object({
    baseline_hours: z.number().nullable(), hourly_cost_usd: z.number().nullable(),
    automation_share: z.number().nullable(), control_hours: z.number().nullable(),
    cash_realization: z.number().nullable(),
  }).strict(),
  next_action: z.enum(["ask_questions", "offer_pilot", "request_trial", "handoff"]),
  summary: z.string().min(1).max(2000),
}).strict();

export const SALES_PROMPT: PromptDefinition = {
  agentType: "sales", version: "sales-1", datasetId: "sales-leads-v1",
  instructions: compose(PROMPT, OPERATIONAL), schemaName: "mschool_sales_v1", maxOutputTokens: 1500,
  jsonSchema: S.obj({
    fit_score: { type: "integer" },
    qualification: S.enumOf(["qualified", "needs_info", "not_fit"]),
    missing_fields: S.strArr,
    roi_assumptions: S.obj({ baseline_hours: S.nullableNum, hourly_cost_usd: S.nullableNum,
      automation_share: S.nullableNum, control_hours: S.nullableNum, cash_realization: S.nullableNum }),
    next_action: S.enumOf(["ask_questions", "offer_pilot", "request_trial", "handoff"]),
    summary: S.str,
  }),
};
