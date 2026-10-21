# Архитектура MSchool MVP

## Топология (раздел 5.6)

```
Browser ──HTTPS──▶ Next.js 16 (web: UI + короткие API, proxy.ts → lib/auth/middleware.ts)
                     │  user-scoped client (publishable key + cookie session) → Supabase Data API (RLS)
                     │  adminDb() (secret key) — только узкие server-side commits (record_tutor_exchange,
                     │  finish/fail_assessment, provision_tenant, Auth invites)
                     ▼
               Supabase: Auth · PostgreSQL 17 (RLS, pgvector) · Storage (private bucket `knowledge`)
                     ▲
Node worker ─────────┘  claim_job (FOR UPDATE SKIP LOCKED), heartbeat 20 s / lease 90 s,
 (worker/main.ts)        ingestion · course_creator · hr_analyst · support · product_analyst · sales,
                         scheduler: schedule_periodic_jobs() раз в минуту (недельные отчеты, счета)
OpenAI Responses API ◀── только сервер/worker (raw fetch, store:false, strict json_schema)
clamd (INSTREAM)     ◀── worker перед парсингом
```

## Границы доверия

| Слой | Что гарантирует |
|---|---|
| proxy (`lib/auth/middleware.ts`) | Сессия, профиль из БД, роль по префиксу, AAL2 для superadmin, CSP nonce, `no-store`. Не единственный барьер. |
| server layouts (`lib/auth/guard.ts`) | Повторная проверка роли на каждой странице. |
| route handlers | Origin для мутаций, strict zod, контекст из `lib/auth/context.ts`, единый error envelope. |
| PostgreSQL | RLS (ENABLE+FORCE) на всех таблицах, составные FK с tenant, immutable-триггеры, SECURITY DEFINER RPC с явными grant. Superadmin глобально — только AAL2. |
| Storage | Политики по `documents.object_path` + `can_manage`; без UPDATE (нет перезаписи). |

## Данные и версии

- Курс публикуется как неизменяемый snapshot; правка — `clone_course` (новые ID, `supersedes_id`, version+1).
- Трек — фиксированный упорядоченный список опубликованных версий курсов одного грейда.
- Порядок прохождения: `track_courses.order_index → course_modules.order_index → lessons.order_index` (единый в `roadmap_manifest` и `unlock_next`).
- Оценка: модель возвращает баллы по критериям → TS-проверка evidence → SQL `finish_assessment` суммирует, применяет critical gates и passing_score, открывает следующий урок в той же транзакции.

## Агенты (раздел 3)

| Агент | Где | Инструменты/доступ |
|---|---|---|
| Sales | worker `sales` | lead + прайс; ROI — `customerRoi` (код); guard на обещания |
| Support | worker `support` | свой ticket, справка `lib/help/articles.ts`, billing summary; форс-эскалация денежных/доступных тем |
| Product Analyst | worker `product_analyst` | только `analytics_template` (allowlist, 5 s, ≤1000 строк, группы ≥5) |
| Методист | worker `course_creator` | подтвержденные chunks своего tenant; результат — только draft |
| Тьютор | `POST /api/agents/tutor` | открытый урок + ≤5 excerpts (cosine ≥0.25) + 3 последних обмена; citations строит сервер |
| Оценщик | `POST /api/agents/assessor` | ответ + точная версия рубрики; итог считает SQL |
| HR Analyst | worker `hr_analyst` | детерминированные `hr_report_metrics`; текст не создает чисел |

## Кэширование

`cacheComponents` выключен; ответы с данными пользователей — `Cache-Control: private, no-store`; глобальных Map с контекстом нет; rate limits — в БД (`consume_ai_quota`, `begin_assessment`).
