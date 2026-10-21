import { z } from "zod";
import { compose, S, type PromptDefinition } from "./common";

const PROMPT = `Ты AI HR Аналитик MSchool. Объясни переданные агрегаты обучения одного tenant за указанный период.
Используй числа только из metrics. Укажи размер группы и ограничения сравнения.
Выдели проблемы процесса: не назначены уроки, просрочены сроки, неясен материал, много апелляций
или технических ошибок. Не трактуй эти данные как диагноз, оценку личности или основание увольнения.
Не делай причинный вывод о сотрудниках без данных. Не сравнивай группы меньше разрешенного размера.
Предложи HR проверяемые действия: уточнить регламент, объяснить критерий, проверить доступ,
назначить обсуждение или пересмотреть черновик будущей версии курса.
Не меняй оценки, грейды, назначения и трудовые решения. Не отправляй отчет внешним получателям.
Верни отчет по schema и перечисли data_quality_flags при неполных данных.`;

const OPERATIONAL = `Вход: period, metrics (детерминированный объект сервера). department_id — только из
metrics.departments. Для подразделений с suppressed=true не делай сравнений, только отметь малый размер.`;

export const hrAnalystOutput = z.object({
  period: z.object({ start: z.string(), end: z.string() }).strict(),
  department_summaries: z.array(z.object({
    department_id: z.string(), observations: z.array(z.string()).max(10), risks: z.array(z.string()).max(10),
    recommended_actions: z.array(z.string()).max(10),
  }).strict()).max(100),
  data_quality_flags: z.array(z.string()).max(20),
  executive_summary: z.string().min(1).max(4000),
}).strict();

export const HR_ANALYST_PROMPT: PromptDefinition = {
  agentType: "hr_analyst", version: "hr_analyst-1", datasetId: "hr-metrics-v1",
  instructions: compose(PROMPT, OPERATIONAL), schemaName: "mschool_hr_analyst_v1", maxOutputTokens: 3000,
  jsonSchema: S.obj({
    period: S.obj({ start: S.str, end: S.str }),
    department_summaries: S.arr(S.obj({ department_id: S.str, observations: S.strArr, risks: S.strArr,
      recommended_actions: S.strArr })),
    data_quality_flags: S.strArr,
    executive_summary: S.str,
  }),
};
