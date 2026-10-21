# Журнал выполнения MSchool MVP

**Текущий этап:** Шаг 6 — итоговый прогон проверок, Docker, восстановление, отчет.
**Статус MVP:** **incomplete / blocked** — см. блокеры. Live AI, антивирус для пользовательских загрузок и
production-развертывание не выполнены; без них MVP не считается готовым (раздел 6.3).

Легенда: `done` — реализовано и проверено указанным тестом; `impl` — реализовано, автоматического теста нет
или он неполный; `blocked` — требуется доступ/ключ владельца; `todo` — не сделано.

## Блокеры, требующие действий владельца

| ID | Что нужно | Влияние |
|---|---|---|
| BLK-01 | `OPENAI_API_KEY` и model IDs (`OPENAI_TUTOR_MODEL`, `OPENAI_ASSESSOR_MODEL`, `OPENAI_WORKER_MODEL`; embeddings `text-embedding-3-small` или другая модель с 1536), подтвержденные `npm run probe`. | Live AI не выполнялся: тьютор, оценщик, методист, HR/Product/Support/Sales-агенты возвращают `503 AI_NOT_CONFIGURED` / эскалируют. Проверены только через test-only fake provider. |
| BLK-02 | clamd с актуальными сигнатурами (`CLAMAV_HOST`); хост `database.clamav.net` запрещен сетевой политикой этой среды. | Обработка реальных пользовательских загрузок останавливается на `SCANNER_UNAVAILABLE`. Pipeline проверен с test-only clamd. |
| BLK-03 | Staging/production Supabase project, домен с HTTPS, SMTP, secret manager. | Deploy и реальные письма не выполнялись (запрещено без разрешения). |
| BLK-04 | Решение владельца по E-SPEC-03 (состав агентов в тарифе Start). | Влияет только на текст прайс-каталога. |

## Требования

| Req ID | Требование | Реализация | Тест | Статус |
|---|---|---|---|---|
| S1-01 | Next 16 + строгий TS + lockfile + scripts | package.json, tsconfig.json, eslint.config.mjs | typecheck, lint, build | done |
| S1-02 | Startup config validator | instrumentation.ts, lib/config.ts | tests/unit/redirect-and-config.test.ts | done |
| S1-03 | Security headers + CSP nonce, без unsafe-eval в prod | next.config.ts, lib/auth/middleware.ts | tests/e2e/smoke.spec.ts | done |
| S1-04 | CI workflow | .github/workflows/ci.yml | — (нет remote/CI-раннера) | impl |
| S1-05 | Health без секретов | app/api/health/route.ts | e2e smoke | done |
| S1-06 | Capability probe | scripts/capability-probe.ts | запуск без ключа → BLOCKED | blocked (BLK-01) |
| S2-01 | Базовая миграция (с errata) | supabase/migrations/202610200001_mschool.sql | `supabase db reset` | done |
| S2-02 | Операционные RPC | migrations 0002–0007 | tests/integration (5 файлов) | done |
| S2-03 | Сгенерированные типы | lib/database.types.ts | CI diff | done |
| S2-04 | Bootstrap superadmin | scripts/bootstrap-superadmin.ts | ручной запуск: отказ без подтверждения | impl |
| S2-05 | Индексы/план retrieval и progress | migrations; docs/delivery-report.md | EXPLAIN | см. отчет |
| S3-01 | Токены, Tailwind 4 через @config, темы | app/globals.css, tailwind.config.ts | e2e: computed `rgb(32, 204, 109)` | done |
| S3-02 | UI kit (кнопки, поля, таблица, диалог, toast, skeleton, LessonCard, GradeStepper, ProgressBar, Chat, Assessment, JobStatus) | components/ui, components/learning, components/hr | e2e + axe | done |
| S3-03 | Safe Markdown без raw HTML | components/ui/safe-markdown.tsx; ESLint запрещает dangerouslySetInnerHTML | — | impl |
| S3-04 | axe + скриншоты 1440/1024/390 × light/dark | tests/e2e/a11y-visual.spec.ts | 0 serious/critical | done |
| S4-01 | proxy.ts → lib/auth/middleware.ts | proxy.ts | e2e auth | done |
| S4-02 | login/logout/recovery/callback/confirm/onboarding/invite/MFA | app/login, app/auth/*, app/onboarding, app/invite, app/mfa | e2e auth, integration invitations | done (recovery/signup письма — только Mailpit) |
| S4-03 | Повторная авторизация в layouts и routes | lib/auth/guard.ts, lib/auth/context.ts | e2e, integration ai-routes | done |
| S4-04 | Bundle без секретов | scripts/check-bundle-secrets.ts | см. отчет | см. отчет |
| S5-01 | AI routes 5.2 | app/api/agents/* | tests/integration/ai-routes.test.ts | done (fake provider) |
| S5-02 | 7 промптов + schemas + версии | prompts/*.v1.ts | evals | done |
| S5-03 | Ingestion: magic bytes, hash, limits, scan, isolated parse, chunks, embeddings | app/api/hr/documents/*, worker/handlers/ingestion.ts | tests/integration/worker.test.ts | done (scanner/embeddings — test-only) |
| S5-04 | Worker claim/lease/heartbeat/retry/dedup | worker/*, claim_job | integration JOB-01 | done |
| S5-05 | API inventory 5.4 | app/api/** | integration + e2e | done (все эндпоинты реализованы) |
| S5-06 | Evals | tests/evals | deterministic: pass; live: blocked | impl / blocked |
| S6-01 | Seed (local only, guard, synthetic, canary B) | scripts/seed.ts | запуск + e2e | done |
| S6-02 | Dockerfile/compose/healthcheck | Dockerfile, docker-compose.yml | см. отчет | см. отчет |
| S6-03 | Restore exercise | docs/runbook.md | см. отчет | см. отчет |

## Приемочный набор 6.2

| ID | Тест | Статус |
|---|---|---|
| SEC-01 | integration rls-isolation | done |
| SEC-02 | integration rls-isolation (metadata), ai-routes (strict body) | done |
| SEC-03 | integration rls-isolation | done |
| SEC-04 | integration rls-isolation | done |
| SEC-05 | integration rls-isolation (RLS + Storage) | done |
| SEC-06 | integration rls-isolation + ai-routes | done |
| SEC-07 | integration rls-isolation | done |
| SEC-08 | integration ai-routes, e2e smoke | done |
| SEC-09 | e2e auth (logout → другой tenant) | done |
| SEC-10 | integration (AAL1 vs AAL2), e2e superadmin | done |
| SEC-11 | integration rls-isolation | done |
| SEC-12 | integration rls-isolation (suspended tenant, job TENANT_INACTIVE) | done |
| LEARN-01..12 | integration learning + ai-routes; e2e employee | done (провайдер — fake) |
| RAG-01/02 | integration ai-routes, evals | done (fake) |
| JOB-01 | integration operations + worker | done |
| BILL-01 | integration operations | done |
| BILL-02 | unit billing-metrics | done |
| BILL-03 | unit billing-metrics (125%) | done |
| UX-01 | e2e a11y-visual, employee 390px | done |
| OPS-01 | restore exercise | см. отчет |
