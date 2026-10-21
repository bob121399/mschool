import { z } from "zod";
import { compose, S, type PromptDefinition } from "./common";

const PROMPT = `Ты AI Методист MSchool. Построй фиксированный корпоративный курс для переданного грейда.
Используй только утвержденные excerpts данного tenant. Сохраняй точный смысл правил, исключений,
последовательности и терминов. Ссылку на источник укажи для каждого правила и критерия.
Не придумывай процедуры, штрафы, требования закона, лимиты платежей и должностные полномочия.
Если источники конфликтуют или недостаточны, добавь coverage_gaps и запрос HR; не выбирай молча.
Строй стандарт для грейда, а не персональную программу для конкретного сотрудника.
Для каждого урока дай цель, понятное объяснение, пример, формативные вопросы и проверяемое задание.
Составь рубрику из наблюдаемых признаков ответа, максимум 20 критериев, сумма max_points ровно 100.
Критические операционные правила помечай critical с обоснованным min_points.
Не публикуй курс и не меняй существующую опубликованную версию. Возвращай только draft DTO.`;

const OPERATIONAL = `Вход: grade, title, limits (max_modules, max_lessons), excerpts [{chunk_id, document_title, page, content}].
source_chunk_ids — только chunk_id из excerpts. Каждый урок: 2-5 quiz вопросов с 2-6 вариантами
(id вариантов "a","b","c",...), correct_option_id из этих id. Рубрика: criteria {id, description,
max_points, critical, min_points, reference}, id вида "C1","C2"; сумма max_points ровно 100;
critical=true требует min_points > 0; passing_score от 60 до 100.`;

const option = z.object({ id: z.string().min(1).max(8), label: z.string().min(1).max(500) }).strict();
const criterion = z.object({
  id: z.string().min(1).max(16), description: z.string().min(1).max(1000), max_points: z.number().int().min(1).max(100),
  critical: z.boolean(), min_points: z.number().int().min(0).max(100), reference: z.string().min(1).max(2000),
}).strict();
export const courseDraftOutput = z.object({
  course_title: z.string().min(1).max(300),
  description: z.string().max(4000),
  grade: z.enum(["junior", "middle", "senior", "head"]),
  objectives: z.array(z.string().max(500)).max(20),
  modules: z.array(z.object({
    title: z.string().min(1).max(300), description: z.string().max(4000),
    lessons: z.array(z.object({
      title: z.string().min(1).max(300), learning_outcome: z.string().min(1).max(2000),
      explanation: z.string().min(1).max(16000), example: z.string().max(4000),
      assessment_question: z.string().min(1).max(6000), source_chunk_ids: z.array(z.string()).max(20),
      quiz: z.array(z.object({ question: z.string().min(1).max(2000), options: z.array(option).min(2).max(6),
        correct_option_id: z.string(), explanation: z.string().min(1).max(2000) }).strict()).min(2).max(5),
      rubric: z.object({ criteria: z.array(criterion).min(1).max(20), passing_score: z.number().int().min(60).max(100) }).strict(),
    }).strict()).min(1).max(20),
  }).strict()).min(1).max(12),
  coverage_gaps: z.array(z.string().max(1000)).max(30),
}).strict();
export type CourseDraft = z.infer<typeof courseDraftOutput>;

const optionSchema = S.obj({ id: S.str, label: S.str });
const criterionSchema = S.obj({ id: S.str, description: S.str, max_points: { type: "integer" },
  critical: { type: "boolean" }, min_points: { type: "integer" }, reference: S.str });
export const COURSE_CREATOR_PROMPT: PromptDefinition = {
  agentType: "course_creator", version: "course_creator-1", datasetId: "course-sources-v1",
  instructions: compose(PROMPT, OPERATIONAL), schemaName: "mschool_course_creator_v1", maxOutputTokens: 16000,
  jsonSchema: S.obj({
    course_title: S.str, description: S.str, grade: S.enumOf(["junior", "middle", "senior", "head"]),
    objectives: S.strArr,
    modules: S.arr(S.obj({
      title: S.str, description: S.str,
      lessons: S.arr(S.obj({
        title: S.str, learning_outcome: S.str, explanation: S.str, example: S.str, assessment_question: S.str,
        source_chunk_ids: S.strArr,
        quiz: S.arr(S.obj({ question: S.str, options: S.arr(optionSchema), correct_option_id: S.str, explanation: S.str })),
        rubric: S.obj({ criteria: S.arr(criterionSchema), passing_score: { type: "integer" } }),
      })),
    })),
    coverage_gaps: S.strArr,
  }),
};
