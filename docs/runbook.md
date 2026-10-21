# Runbook

## Локальный запуск

```bash
dockerd &                          # если демон не запущен (облачная песочница)
npx supabase start                 # образы public.ecr.aws/supabase/*
npx supabase db reset              # миграции 0001–0006 с нуля (только локально!)
npm run db:types
npx supabase status -o env         # значения для .env.local (см. .env.example)
ALLOW_SEED=true npm run seed       # учетные данные: .secrets/seed-credentials.json (не в git)
npm run build && npm run start     # http://localhost:3000
npm run worker:dev                 # отдельный процесс
```

Вход superadmin: email из credentials-файла → `/mfa` → TOTP-код (секрет в том же файле, только локально).

## Секреты и окружения

- `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` — только в secret manager окружения (web и worker). Браузер получает URL и publishable key.
- Отдельные Supabase projects для local / staging / production. Миграции применяются **до** выкладки приложения и совместимы с предыдущей версией (expand/contract).
- Production model IDs выбирает владелец после `npm run probe` (Structured Outputs + embeddings 1536).

## Bootstrap superadmin (production)

```bash
npm run bootstrap:superadmin -- --project-ref <ref> --auth-user <uuid> --confirm "PROMOTE <uuid> TO SUPERADMIN ON <ref>"
```
Пользователь должен существовать в Auth с подтвержденным email; первый вход — подключение TOTP.

## Инциденты

| Сигнал | Действие |
|---|---|
| Всплеск 5xx | Логи по `trace_id` (тела запросов не логируются) |
| Stuck jobs > 10 мин | `select * from agent_jobs where status='running' and lease_until < now()`; claim автоматически переподхватывает просроченные lease; исчерпанные попытки → failed |
| AI budget > 80% | `tenants.max_daily_ai_calls`, договорной бюджет; превышение показывается как ограничение вычислений |
| Попытки межтенантного доступа | 403/404 в логах + RLS; проверить `admin_audit_logs` |
| Сканер недоступен | Документы в `needs_review` с `SCANNER_UNAVAILABLE`; восстановить clamd и «Запустить обработку» |

## Резервное копирование и восстановление (OPS-01)

Целевые RPO ≤ 24 ч, RTO ≤ 8 ч (подтверждаются упражнением). Процедура, проверенная локально (см. delivery report):

1. `pg_dump` БД проекта (формат custom, без owner/privileges) → файл с ограниченным доступом.
2. Резервная копия объектов Storage: выгрузка через API с манифестом SHA-256.
3. Восстановление в **изолированное** окружение (отдельный контейнер `supabase/postgres`), сверка количества строк ключевых таблиц и хэшей объектов.
4. Ответственные: владелец платформы (DBA) — БД; владелец инфраструктуры — Storage. Протокол упражнения хранится вне репозитория.

## Удаление tenant (2.5)

Кнопки нет. Процедура DBA: остановка jobs → экспорт (`scripts/export-tenant.ts`) → удаление объектов Storage через API → удаление векторов/ответов/связей → обезличивание агрегатов → проверка ссылок. Immutable-триггеры не обходятся обычным CRUD.

## Открытые эксплуатационные задачи

- Изоляция сети для parser-процесса (отдельный контейнер `network_mode: none`) — не реализована (D-13).
- Алерты (5xx, stuck jobs, AI budget, cross-tenant) — требуют выбранного стека мониторинга владельца.
- OCR-провайдер — не подключен (сканы → needs_review).
