@AGENTS.md

# MSchool — инструкции для Claude Code

Единый источник требований: `docs/spec/MSchool_Master_Prompt_v1.md` (Master Prompt v1.0).
Найденные в нём противоречия и технические ошибки и их исправления: `docs/spec-errata.md`.
Журнал выполнения (requirement → path → test → status): `docs/implementation-status.md`.
Архитектурные решения: `docs/decisions.md`. Версии окружения: `docs/build-environment.md`.

## Неизменяемые инварианты (раздел «Обязательные инварианты» + 2.1)

1. Идентичность — только проверенная сессия (`auth.getUser()`); tenant и роль читаются из `public.users`,
   никогда из формы, URL, заголовка или `user_metadata`.
2. Все дочерние связи включают tenant (составные FK `(id, tenant_id)`). UUID — не проверка доступа.
3. Опубликованные course/track/approved source неизменяемы (триггеры `private.guard_*`). Изменение — только
   через `clone_course` (новая версия, новые ID, `supersedes_id`).
4. Сотрудник не пишет в progress, rubric, billing, audit, роли. Только SECURITY DEFINER RPC с внутренними проверками.
5. Генерация и проверка ИИ проходят структурную валидацию (strict JSON schema + zod + SQL). Итоговый `passed`
   и сумма считаются в SQL (`finish_assessment`), не моделью.
6. Публикация курса/трека, подтверждение источника, изменение грейда/роли, подтверждение оплаты — только человек.
7. `SUPABASE_SECRET_KEY` и `OPENAI_API_KEY` — только сервер (`lib/supabase/admin.ts`, `lib/ai/openai.ts`,
   worker). Никогда в Client Components. `adminDb()` не используется для обычного чтения страниц.
8. Файлы, векторы, кэши, очереди и отчёты подчиняются той же границе tenant, что и SQL.
9. Superadmin: глобальный доступ только с MFA (AAL2) — проверяется и в proxy, и в БД (`private.is_superadmin`).
10. Никаких mock/fake провайдеров в production-коде. Нет ключа → явная ошибка `AI_NOT_CONFIGURED`.
    Fake fetch существует только внутри тестового процесса.
11. Не отключать RLS, не добавлять `grant all ... to authenticated`, не делать bucket публичным.
12. Не изменять production и не отправлять реальные приглашения без отдельного разрешения владельца.

## Стек

Next.js 16 App Router (`proxy.ts` → `lib/auth/middleware.ts`; второго корневого `middleware.ts` нет),
React 19, Node 22, TypeScript strict + `noUncheckedIndexedAccess`, Supabase (Auth/Postgres/Storage/pgvector),
Tailwind CSS 4 через `@tailwindcss/postcss` и `@config "../tailwind.config.ts"`, OpenAI Responses API (raw fetch).
`cacheComponents` выключен (см. decisions D-02).

## Команды

```bash
npx supabase start                 # локальный стек (нужен dockerd; образы из public.ecr.aws)
npx supabase db reset              # применить миграции с нуля (только локально!)
npm run db:types                   # сгенерировать lib/database.types.ts из применённой схемы
ALLOW_SEED=true npm run seed       # синтетические tenant A/B (только local/test host)
npm run typecheck && npm run lint
npm run test                       # unit
npm run test:integration           # реальный local Supabase: RLS/RPC/Storage с JWT тестовых пользователей
npm run test:evals                 # детерминированные eval fixtures (live — только при ключе)
npm run build && npm run test:e2e  # Playwright против `next start`
npm run worker:dev                 # durable worker (claim/lease/heartbeat)
```

Env: `.env.local` (не в git) — см. `.env.example`. Для локального Supabase значения выдаёт `npx supabase status -o env`.

## Правила работы

- Новые изменения схемы — только новой миграцией в `supabase/migrations/` + `npm run db:types`.
  Каждая новая таблица: ENABLE + FORCE RLS, revoke/grant; каждая функция: явные revoke/grant.
- Мутации API: `route(fn, { mutation: true })` из `lib/api.ts` (Origin + error envelope), сессия/роль
  через `lib/auth/context.ts`, вход — strict zod-схема.
- Ошибки SQL пробрасываются как UPPER_SNAKE коды; маппинг — `databaseError` в `lib/http.ts`.
- Промпты — `prompts/*.vN.ts`; изменение текста требует новой версии и прогона `npm run test:evals`.
- Ответы с пользовательскими данными: `Cache-Control: private, no-store`.
- Model text рендерится только через `components/ui/safe-markdown.tsx` (без raw HTML).

## Текущий этап

См. верх `docs/implementation-status.md`.
