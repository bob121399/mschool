"use client";

export type ApiError = { code: string; trace_id?: string; status: number };
export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ApiError };

/** Same-origin JSON fetch with the uniform error envelope (spec 5.5). */
export async function apiFetch<T = unknown>(url: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", status: 0 } };
  }
  if (res.status === 204) return { ok: true, data: undefined as T, status: 204 };
  let payload: unknown = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) {
    const err = (payload as { error?: { code?: string; trace_id?: string } } | null)?.error;
    return { ok: false, error: { code: err?.code ?? "UNKNOWN_ERROR", trace_id: err?.trace_id, status: res.status } };
  }
  return { ok: true, data: payload as T, status: res.status };
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Сессия истекла. Войдите снова.",
  FORBIDDEN: "Недостаточно прав для этого действия.",
  ORIGIN_REJECTED: "Запрос отклонен политикой безопасности.",
  NOT_FOUND: "Не найдено или недоступно.",
  RATE_LIMIT: "Слишком часто. Подождите минуту и повторите.",
  ATTEMPT_LIMIT: "Лимит попыток на сегодня исчерпан.",
  IN_PROGRESS: "Проверка уже выполняется. Дождитесь результата.",
  IDEMPOTENCY_CONFLICT: "Этот запрос уже использован с другим текстом.",
  RETRY_EXHAUSTED: "Повторы исчерпаны. Отправьте ответ как новую попытку.",
  REVISION_CONFLICT: "Черновик изменен другим пользователем. Обновите страницу, чтобы не потерять правки.",
  PUBLISHED_IMMUTABLE: "Опубликованная версия не изменяется. Создайте новую версию.",
  MISSING_RUBRIC: "У оцениваемого урока нет вопроса или рубрики.",
  EMPTY_COURSE: "В курсе нет уроков.",
  UNAPPROVED_SOURCE: "Есть ссылки на неподтвержденные источники.",
  INVALID_TRACK: "Трек должен содержать опубликованные курсы того же грейда.",
  WEIGHTS_MUST_SUM_100: "Сумма max_points рубрики должна быть ровно 100.",
  INVALID_POINTS: "Неверные баллы критерия (целые, min ≤ max, critical требует min > 0).",
  INVALID_CRITERION: "У критерия заполнены не все поля.",
  INVALID_QUIZ: "Вопрос квиза: 2–6 вариантов, текст и пояснение обязательны.",
  INVALID_QUIZ_OPTION: "Варианты квиза должны иметь уникальные id и текст.",
  INVALID_QUIZ_KEY: "Правильный ответ квиза должен быть одним из вариантов.",
  AI_NOT_CONFIGURED: "ИИ-провайдер не настроен владельцем окружения. Функция недоступна.",
  AI_UNAVAILABLE: "Проверка недоступна. Повторите с тем же запросом.",
  AI_BUSY: "Проверка временно перегружена. Повторите с тем же запросом.",
  AI_REFUSED: "Модель отказалась отвечать. Переформулируйте или обратитесь к HR.",
  AI_INVALID_CITATIONS: "Ответ тьютора не прошел проверку источников. Повторите вопрос.",
  ACTIVE_ASSIGNMENT_EXISTS: "У сотрудника уже есть активное назначение.",
  USER_EXISTS: "Пользователь с этим email уже зарегистрирован.",
  INVALID_EMAIL: "Неверный email.",
  REASON_REQUIRED: "Укажите основание (не менее 10 символов).",
  ONBOARDING_NONCE_INVALID: "Форма устарела. Обновите страницу.",
  VERIFIED_EMAIL_REQUIRED: "Сначала подтвердите email.",
  INVALID_INVITATION: "Приглашение недействительно или истекло. Попросите HR отправить новое.",
  INVITATION_EMAIL_MISMATCH: "Приглашение выдано на другой email.",
  ROLE_CONFLICT: "Учетная запись уже привязана к другой роли или компании.",
  MFA_REQUIRED: "Требуется двухфакторная проверка.",
  BODY_TOO_LARGE: "Слишком большой запрос.",
  INVALID_REQUEST: "Проверьте заполнение формы.",
  NETWORK_ERROR: "Нет соединения с сервером.",
  DATABASE_UNAVAILABLE: "База данных недоступна. Повторите позже.",
  NOT_CONFIGURED: "Окружение не настроено владельцем.",
  TOO_EARLY: "Слишком рано.",
  LAST_HR: "Нельзя снять роль с последнего HR компании.",
  OVERRIDE_DOWNGRADE_NOT_SUPPORTED: "Понижение уже засчитанного урока через апелляцию не поддерживается.",
  DOCUMENT_NOT_REVIEWABLE: "Документ еще не обработан или уже подтвержден.",
  SOURCE_NOT_APPROVED: "Выбранные источники должны быть подтверждены HR.",
  PERIOD_NOT_CLOSED: "Период еще не завершен.",
  PERIOD_NOT_MONDAY: "Неделя должна начинаться с понедельника.",
  SCANNER_UNAVAILABLE: "Антивирусная проверка недоступна: обработка файла остановлена.",
  FILE_TYPE_MISMATCH: "Содержимое файла не соответствует PDF/TXT.",
  FILE_TOO_LARGE: "Файл больше 20 МБ.",
};

export function errorMessage(error: ApiError): string {
  const base = MESSAGES[error.code] ?? (error.status >= 500 ? "Техническая ошибка. Повторите позже." : "Не удалось выполнить действие.");
  return error.trace_id && error.status >= 500 ? `${base} (код: ${error.trace_id.slice(0, 8)})` : base;
}
