# Delivery report — MSchool MVP (шаги 1–6)

Дата: 2026-10-20. Репозиторий: `/home/user/mschool` (локальный git, ветка `main`; удаленного репозитория нет).
**Статус: incomplete / blocked** — обязательные live-проверки ИИ и антивируса не выполнены из-за отсутствия
доступов (BLK-01, BLK-02), production/staging не развертывались (BLK-03). MVP не объявляется готовым.

## Что реализовано

- **БД (Supabase, PostgreSQL 17):** базовая миграция ТЗ с 12 исправлениями (одна ошибка делала миграцию
  неприменимой: CASE внутри IF в `consume_ai_quota`) + 5 миграций операционных RPC: приглашения, CAS-сохранение
  и clone курсов, треки, апелляции с ручным override, одноразовые сессии урока для учета активности,
  durable jobs (claim/lease/heartbeat/retry), побочные эффекты worker с проверкой lease и активности tenant,
  billing (активные места, идемпотентные счета, ручное подтверждение оплаты), аналитика по allowlist,
  журнал просмотра superadmin. Superadmin получает глобальный доступ только с MFA (AAL2) — на уровне БД.
- **Next.js 16:** `proxy.ts` → `lib/auth/middleware.ts` (CSP nonce на всех страницах, роли из БД, MFA),
  все эндпоинты API inventory 5.4, AI-маршруты из листингов 5.2, экраны трех ролей (сотрудник: трек, плеер,
  тьютор, самопроверка, задание с восстановлением по requestId, история и апелляции; HR: чек-лист, сотрудники
  с приглашениями/CSV/массовым назначением, источники с проверкой текста, курсы и редактор с CAS/публикацией/
  новой версией, треки, отчеты, апелляции, оплата; superadmin: метрики MRR/ARR/NRR/GRR и мост, компании с
  основанием просмотра, счета, поддержка, агенты, аналитика, лиды).
- **Агенты:** 7 версионированных промптов (`prompts/*.v1.ts`) со strict JSON schema и zod; тьютор и оценщик —
  синхронные маршруты; методист, HR-аналитик, поддержка, продуктовый аналитик, sales — durable worker.
- **Worker:** изолированный парсер PDF (дочерний процесс без секретов, лимиты), чанкинг 400–700 токенов,
  embeddings, clamd INSTREAM, планировщик недельных отчетов и счетов, graceful shutdown.
- **Seed:** 2 синтетические компании, superadmin с TOTP, по HR и 12 сотрудников, курс и трек на каждый грейд,
  draft, реальные PDF-fixtures через настоящий парсер, скан → needs_review, canary только в B, состояния
  passed/failed/locked/overdue/completed/provider_error/appeal, подписки/счета/события.

## Исправления ТЗ

Полный список с проверками — `docs/spec-errata.md` (SQL: 13, TS: 11, противоречия разделов: 6).

## Выполненные проверки

### Итоговый прогон (раздел 6, шаг 6.7), `scripts/dev/final-gate.sh`, логи в `.secrets/final-gate/` (не в git)

| Шаг | Команда | Exit code | Время | Результат |
|---|---|---|---|---|
| npm_ci | `npm ci` | 0 | 29 s | — |
| db_reset | `npx supabase db reset` | 0 | 30 s | миграции 0001–0006 с нуля |
| gen_types | `supabase gen types … && git diff --exit-code` | 0 | 2 s | типы совпадают с закоммиченными |
| seed | `ALLOW_SEED=true npm run seed` | 0 | 16 s | 2 tenant, 24 сотрудника, 8 опубликованных курсов |
| typecheck | `npm run typecheck` | 0 | 6 s | — |
| lint | `npm run lint` (`--max-warnings=0`) | 0 | 13 s | — |
| test | `npm run test` | 0 | 2 s | 25/25 unit |
| test:integration | `npm run test:integration` | 0 | 22 s | 55/55 на реальном локальном Supabase |
| test:evals | `npm run test:evals` | 0 | 1 s | 36 passed, 1 skipped (live eval не выполнен — BLK-01) |
| build | `npm run build` | 0 | 13 s | — |
| check:bundle | `npm run check:bundle` | 0 | 0 s | секретов в браузерном бандле нет |
| test:e2e | `npm run test:e2e` | E2E_CODE | E2E_TIME | E2E_RESULT |

### Дополнительно

- Упражнение восстановления (OPS-01): `bash scripts/dev/restore-exercise.sh` → `RESTORE_EXERCISE=OK`: в изолированном
  контейнере `supabase/postgres` совпали счетчики (tenants 2, users 27, courses 10, lessons 40, progress 96,
  invoices 4, auth.users 27) и md5 прогресса; 4 объекта Storage сверены по SHA-256 с `documents.sha256`.
  Ограничение: объекты проверены на уровне файлов, загрузка во второй Storage-сервис не выполнялась.
- Capability probe: `npm run probe` → `BLOCKED` (exit 2): нет ключа и моделей.
- Планы запросов: retrieval выполняет точный cosine только по заранее ограниченным chunks урока (CTE по
  `lesson_sources` + индексы `documents_tenant_idx`, `chunks_tenant_document_idx`), без глобального top-k и без HNSW.
  На объеме seed планировщик выбирает seq scan для `progress`/`activity_events`; индексы
  (`progress_tenant_user_idx`, `activity_billing_idx`) есть — проверка на целевом объеме данных остается задачей пилота.

## Что не выполнено и почему

| Пункт | Причина | Что нужно от владельца |
|---|---|---|
| Live AI smoke и live eval (тьютор, оценщик, методист, агенты) | Нет `OPENAI_API_KEY` и model IDs | Ключ в secret manager, model IDs, запуск `npm run probe`, затем `EVAL_LIVE=true npm run test:evals` и ручной happy path |
| Антивирус для пользовательских загрузок | `database.clamav.net` запрещен сетевой политикой среды | clamd с сигнатурами (`CLAMAV_HOST`) |
| Deploy staging/production, HTTPS, SMTP | Нет доступов; изменение production запрещено без разрешения | Supabase projects, домен, SMTP, secret manager |
| Реальные письма-приглашения | Отправлялись только в локальный Mailpit | Разрешение и SMTP |
| OCR | Провайдер не выбран | Решение по OCR и его стоимости |
| Сетевая изоляция parser-процесса | Не реализована (D-13) | Решение по контейнерной топологии |
| Алерты/мониторинг | Нет выбранного стека | Выбор инструмента |

Стоимость live smoke: **0** — live-вызовы провайдера не выполнялись.
