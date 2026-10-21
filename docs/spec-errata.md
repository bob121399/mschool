# Ошибки и противоречия ТЗ (MSchool Master Prompt v1.0) и их исправления

Принцип: продуктовые требования и ограничения безопасности сохраняются; исправляется только то, что
не компилируется, не работает или противоречит другим пунктам документа. Каждое исправление в коде
помечено комментарием `ERRATA <ID>`. Статус «проверено» означает воспроизведение и тест на локальном Supabase/сборке.

## SQL (раздел 2.2, `supabase/migrations/202610200001_mschool.sql`)

Оригинальный листинг сохранён в `docs/spec/section-2.2-original.sql`; итоговая миграция собирается
скриптом `scripts/dev/build-base-migration.py`, который применяет только перечисленные ниже замены и
падает, если какая-либо замена не нашла ровно одно совпадение.

| ID | Проблема | Исправление | Проверка |
|---|---|---|---|
| E-SQL-11 | **Миграция не применялась.** В `consume_ai_quota` внутри условия `IF` стоит `CASE WHEN … THEN` без скобок. PL/pgSQL читает условие `IF` до первого `THEN`, функция не компилируется: `syntax error at end of input`. Документ утверждает, что миграция не запускалась, — это подтвердилось. | `CASE` заключён в скобки. | `supabase db reset` проходит с нуля |
| E-SQL-01 | SECURITY DEFINER helpers читают таблицы с `FORCE RLS`. Если у владельца миграции нет BYPASSRLS, политика `users` вызывает `private.tenant_id()`, которая снова читает `users` → бесконечная рекурсия политик. На Supabase `postgres` имеет BYPASSRLS, но зависимость не была явной. | Предусловие в начале миграции: `MIGRATION_OWNER_REQUIRES_BYPASSRLS`. | Проверено: `postgres` — `rolbypassrls=t` |
| E-SQL-02 | `validate_rubric` приводит `max_points` к integer **до** проверки целочисленности → дробное значение даёт `22P02 invalid input syntax`, а не `INVALID_POINTS`. | Проверка целочисленности и диапазона до приведения типа; проверка, что элемент — объект. | integration: rubric validation |
| E-SQL-03 | `validate_quiz`: `item - 'id'` падает на не-объектных элементах `options`. | Проверка `jsonb_typeof(item) = 'object'` первой. | integration |
| E-SQL-05 | `unique (user_id, track_id)` + `assign_track` возвращает существующее назначение без учёта статуса: после отмены (смена грейда) сотрудника нельзя снова назначить на тот же трек, а RPC молча возвращает отменённое назначение. | Частичный уникальный индекс `where status <> 'cancelled'`; идемпотентность только среди живых назначений. | integration |
| E-SQL-06 | `agent_jobs` без колонки результата, heartbeat и типизированного `agent_type`; раздел 3.9 требует durable results и heartbeat. Конечные сущности не имели уникального job key (повтор job мог создать второй курс/отчёт). | `result`, `heartbeat_at`, `finished_at`, `max_attempts`, check по типам; `courses.source_job_id unique`, `hr_reports.source_job_id unique`. | integration JOB-01 |
| E-SQL-14 | Нет механизма «server session token» для `lesson_engaged` (2.3). Кроме того, `unique (tenant_id,user_id,event_type,source_id)` с `source_id = lesson_id` позволил бы учесть занятие уроком лишь один раз за всё время → активное место в следующем месяце не засчитывалось бы (противоречие с 1.2). | Таблица `lesson_sessions` (одноразовый токен, хэш, срок), `source_id` = id сессии. RPC `start_lesson_session` / `record_lesson_engagement` (≥30 с). | integration BILL-01 |
| E-SQL-16 | Уникальность `order_index` не deferrable, хотя 4.4 требует транзакционной перестановки «без уникальных конфликтов». | `deferrable initially immediate`. | — |
| E-SQL-31 | 2.4 требует статус `needs_review` для документов (пароль/повреждение/скан), в CHECK его нет. Нет метаданных загрузки (имя, MIME, размер, страницы). | Добавлены статус и колонки; политика удаления Storage учитывает `needs_review`. | integration |
| E-SQL-32 | Назначение трека (кадрово значимое действие HR) не попадало в административный аудит. | Запись `admin_audit_logs` в `assign_track`. | integration |
| E-SQL-40 | `private.is_superadmin()` не учитывал MFA, хотя 5.4 требует «Superadmin + MFA», а SEC-10 — глобальный доступ только с MFA. Сессия только по паролю получала глобальный RLS-доступ через Data API в обход proxy. | В миграции 2 `is_superadmin()` требует `auth.jwt()->>'aal' = 'aal2'`. | integration SEC-10 |

## TypeScript (раздел 5.2)

| ID | Проблема | Исправление |
|---|---|---|
| E-TS-01 | `create-next-app@16` (16.4) включает `cacheComponents: true`; с ним `export const runtime = "nodejs"` в AI-маршрутах ТЗ запрещён (ошибка сборки), а кэширование компонентов создаёт риск межпользовательского кэша tenant-данных (2.5). Также генератор подключает Tailwind через `@tailwindcss/turbopack`, хотя ТЗ требует только `@tailwindcss/postcss`. | `cacheComponents` выключен, PostCSS-плагин `@tailwindcss/postcss`, `@tailwindcss/turbopack` удалён. Решение D-02. |
| E-TS-02 | `databaseError` отображал любую неизвестную ошибку БД (в том числе бизнес-правила `ACTIVE_ASSIGNMENT_EXISTS`, `MISSING_RUBRIC`, `PUBLISHED_IMMUTABLE`) в `503 DATABASE_UNAVAILABLE` — UI показывал бы «БД недоступна» вместо понятной ошибки, а клиент повторял бы запрос. | Маппинг по SQLSTATE: наши UPPER_SNAKE коды с 23514/22023/23505/40001/P0001 → 409/400; нативные сообщения PostgreSQL наружу не передаются. |
| E-TS-06 | `lib/auth/middleware.ts`: проверенный пользователь без профиля (только что зарегистрировался или принимает приглашение) получал редирект на `/forbidden` — onboarding и приём приглашения недостижимы, хотя 5.3 требует `/onboarding` без redirect loop. Не было проверки MFA (AAL2) superadmin (5.3 «перед production дополни»). | Без профиля → `/onboarding`; superadmin без AAL2 → `/mfa`; API → `403 MFA_REQUIRED`. |
| E-TS-07 | `proxy.ts` matcher покрывал только защищённые пути, поэтому публичные страницы не получали CSP nonce (шаг 1.6 требует строгую CSP с nonce). | Matcher на все пути кроме статики; авторизационные правила по-прежнему только для защищённых префиксов. |
| E-TS-08 | При отсутствии `OPENAI_API_KEY` `requiredEnv` бросал обычный `Error` → `500 INTERNAL_ERROR`. | Явный `503 AI_NOT_CONFIGURED` (интеграция помечена заблокированной, mock не включается). |
| E-TS-14 | `POST /api/me/reading-complete` должен отвечать 204, но `NextResponse.json` не допускает тело при 204. | Отдельный `noContent()`. |
| E-TS-15 | Модули с `import "server-only"` нельзя импортировать из отдельного Node worker (пакет бросает исключение вне `react-server` условия). | Worker запускается с `--conditions=react-server`; в Vitest `server-only` подменяется пустым модулем. |

## Противоречия между разделами

| ID | Противоречие | Решение |
|---|---|---|
| E-SPEC-01 | 4.1 «внешний font CDN не нужен», а шаблон create-next-app подключает Geist через `next/font/google`. | Шрифт удалён, используется системный стек из `globals.css`. |
| E-SPEC-02 | 4.4 описывает `/hr` для HR, а proxy-листинг пускает туда и superadmin, у которого `tenant_id = NULL` (страницы HR не могут определить tenant). 2.5: глобальное исследование — «с явно выбранной компанией». | `/hr` — только `hr_admin`; superadmin работает с tenant через `/superadmin/tenants/[id]` с явным выбором компании. |
| E-SPEC-03 | Тарифная таблица 1.2: Start — «все четыре tenant-агента», Enterprise — «все семь применимых сервисов»; tenant-ориентированных агентов фактически пять (Support, Методист, Тьютор, Оценщик, HR-аналитик). | В каталоге цен: Start/Growth — Методист, Тьютор, Оценщик, HR-аналитик + Support как сервис платформы. Требует подтверждения владельца продукта (не влияет на безопасность). |
| E-SPEC-04 | Промпты раздела 3 (полные + общий system prefix «для всех семи агентов») расходятся с короткими `TUTOR_PROMPT`/`ASSESSOR_PROMPT` в 5.2; маршруты 5.2 не используют общий prefix. | `prompts/*.v1.ts`: instructions = общий prefix 3.1 + промпт раздела 3 + операционный текст 5.2. `lib/ai/prompts.ts` экспортирует их под именами из листинга. |
| E-SPEC-05 | Раздел 6 называет исполнителя «Claude Code Pro» и требует OpenAI Responses API в runtime. | Сохранено: runtime-провайдер — OpenAI (продуктовое требование ТЗ). Claude Code используется только как инструмент разработки. |
| E-SPEC-06 | 2.4: путь `knowledge/{tenant}/{document}/{random}.pdf`, а CHECK в `documents` требует `object_path like tenant/doc/%`. | `knowledge` — это bucket; `object_path` (имя объекта) = `{tenant}/{document}/{random}.{pdf|txt}`. |
