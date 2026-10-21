# Журнал выполнения MSchool MVP

**Текущий этап:** Шаги 3–5 — UI kit, Auth, API и worker.
**Статус MVP:** incomplete (не готов). Обязательные проверки раздела 6.2 ещё не пройдены полностью.

Легенда статусов: `done` — реализовано и проверено указанным тестом; `impl` — реализовано, тест не написан
или не пройден; `blocked` — требуется доступ/ключ владельца; `todo` — не начато.

## Блокеры, требующие действий владельца

| ID | Что нужно | Влияние |
|---|---|---|
| BLK-01 | `OPENAI_API_KEY` и model IDs (`OPENAI_TUTOR_MODEL`, `OPENAI_ASSESSOR_MODEL`, `OPENAI_WORKER_MODEL`), подтверждённые capability probe (`npm run probe`). | Live AI: тьютор, оценщик, методист, HR/Product/Support/Sales агенты возвращают `503 AI_NOT_CONFIGURED`. |
| BLK-02 | Доступ к сигнатурам ClamAV (`database.clamav.net` запрещён сетевой политикой среды) или собственный clamd (`CLAMAV_HOST`). | Обработка реальных пользовательских загрузок останавливается на стадии `SCANNER_UNAVAILABLE`. |
| BLK-03 | Staging/production Supabase project, домен, SMTP. | Deploy и реальные письма не выполнялись (запрещено без разрешения). |

## Требования

| Req ID | Требование | Реализация | Тест | Статус |
|---|---|---|---|---|
| S1-01 | Next 16 + строгий TS + lockfile + scripts | package.json, tsconfig.json, eslint.config.mjs | `npm run typecheck`, `npm run lint`, `npm run build` | impl |
| S1-02 | Startup config validator | instrumentation.ts, lib/config.ts | tests/unit/config.test.ts | impl |
| S1-03 | Security headers + CSP nonce | next.config.ts, lib/auth/middleware.ts | tests/e2e | impl |
| S1-04 | CI workflow | .github/workflows/ci.yml | — (нет remote) | impl |
| S1-05 | Health без секретов | app/api/health/route.ts | tests/e2e/smoke | impl |
| S2-01 | Базовая миграция (с errata) | supabase/migrations/202610200001_mschool.sql | `supabase db reset` | done |
| S2-02 | Операционные RPC (приглашения, CAS, clone, апелляции, jobs, billing) | supabase/migrations/202610200002_operations.sql | tests/integration/*.test.ts (35 тестов) | done |
| S2-04 | Bootstrap superadmin (project ref + operator intent + audit) | scripts/bootstrap-superadmin.ts | ручной запуск: отказ без подтверждения | impl |
| SEC-01 | HR A ↛ tenant B | RLS + RPC checks | tests/integration/rls-isolation.test.ts | done |
| SEC-02 | user_metadata/role spoof | private.* helpers | rls-isolation.test.ts | done (SQL); API — e2e |
| SEC-03 | Employee ↛ protected tables | grants + RLS | rls-isolation.test.ts | done |
| SEC-04 | No cross-tenant FK | composite FK | rls-isolation.test.ts | done |
| SEC-05 | Locked lesson/rubric/raw PDF/vectors hidden | RLS + Storage policies | rls-isolation.test.ts | done |
| SEC-06 | Retrieval scoped, no canary B | match_lesson_chunks | rls-isolation.test.ts | done (SQL); API — e2e |
| SEC-07 | Service-only EXECUTE denied | grants | rls-isolation.test.ts | done |
| SEC-10 | Superadmin requires MFA; immutable | is_superadmin AAL2 | rls-isolation.test.ts | done |
| SEC-11 | Published immutable; clone | triggers, clone_course | rls-isolation.test.ts | done |
| SEC-12 | Suspended tenant | tenant_id(), assert_job | rls-isolation.test.ts | done |
| LEARN-01..12 | Учебный процесс (SQL-уровень) | RPC | tests/integration/learning.test.ts | done (SQL); route — tests/unit |
| JOB-01 | Lease recovery, один draft | claim_job, create_generated_course | tests/integration/operations.test.ts | done |
| BILL-01 | Active seats, idempotent invoice | generate_invoice | operations.test.ts | done |
| S2-03 | Сгенерированные типы | lib/database.types.ts | CI diff | done |
