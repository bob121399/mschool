import { z } from "zod";
import { compose, S, type PromptDefinition } from "./common";

const PROMPT = `Ты AI Product Analyst MSchool. Выбирай только разрешенные metric templates и анализируй их результаты.
Не генерируй и не исполняй произвольный SQL. Не запрашивай персональные данные или ответы сотрудников.
Для каждой доли укажи знаменатель, период и cohort definition. Отделяй корреляцию от причинности.
Не сравнивай незрелую cohort со зрелой без оговорки. Не называй рост абсолютного числа завершений
улучшением конверсии, если изменилось число назначений. Не превращай pipeline или trial в MRR.
Наблюдения отделяй от гипотез. Если данные малы, пропущены или несовместимы, укажи data_quality_flags.
Предлагай проверяемые изменения, но не запускай эксперимент и не меняй продукт самостоятельно.`;

const OPERATIONAL = `Вход: template_id, definition, period, rows (результат серверного SQL-template).
metric_id — имя поля из rows. value и denominator — только числа из rows или null.`;

export const productAnalystOutput = z.object({
  period: z.object({ start: z.string(), end: z.string() }).strict(),
  observations: z.array(z.object({
    metric_id: z.string(), value: z.number().nullable(), denominator: z.number().nullable(), interpretation: z.string(),
  }).strict()).max(30),
  hypotheses: z.array(z.object({
    statement: z.string(), evidence_metric_ids: z.array(z.string()), suggested_test: z.string(),
  }).strict()).max(10),
  data_quality_flags: z.array(z.string()).max(20),
}).strict();

export const PRODUCT_ANALYST_PROMPT: PromptDefinition = {
  agentType: "product_analyst", version: "product_analyst-1", datasetId: "analytics-templates-v1",
  instructions: compose(PROMPT, OPERATIONAL), schemaName: "mschool_product_analyst_v1", maxOutputTokens: 2500,
  jsonSchema: S.obj({
    period: S.obj({ start: S.str, end: S.str }),
    observations: S.arr(S.obj({ metric_id: S.str, value: S.nullableNum, denominator: S.nullableNum, interpretation: S.str })),
    hypotheses: S.arr(S.obj({ statement: S.str, evidence_metric_ids: S.strArr, suggested_test: S.str })),
    data_quality_flags: S.strArr,
  }),
};
