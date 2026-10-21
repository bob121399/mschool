# MSchool

Корпоративное обучение по утвержденным регламентам: источник → курс (человеческая публикация) →
фиксированный трек грейда → обучение с RAG-тьютором → проверка по рубрике (итог считает SQL) → отчеты.

Статус: **MVP incomplete** — см. `docs/implementation-status.md` (блокеры BLK-01…BLK-04) и `docs/delivery-report.md`.

- Требования: `docs/spec/MSchool_Master_Prompt_v1.md`
- Исправления ТЗ: `docs/spec-errata.md`
- Архитектура / решения / метрики / runbook: `docs/architecture.md`, `docs/decisions.md`, `docs/metric-definitions.md`, `docs/runbook.md`
- Инструкции для Claude Code: `CLAUDE.md`

## Быстрый старт (локально)

```bash
npm ci
npx supabase start && npx supabase db reset
npx supabase status -o env      # перенесите значения в .env.local по образцу .env.example
ALLOW_SEED=true npm run seed    # синтетические компании; учетные данные в .secrets/ (не в git)
npm run build && npm run start  # http://localhost:3000
npm run worker:dev              # фоновые задачи
```

## Проверки

```bash
npm run typecheck && npm run lint
npm run test               # unit
npm run test:integration   # реальный локальный Supabase (RLS/RPC/Storage, JWT тестовых пользователей)
npm run test:evals         # детерминированные eval; live — EVAL_LIVE=true + ключ
npm run test:e2e           # Playwright против next start (PW_EXECUTABLE_PATH для предустановленного Chromium)
npm run check:bundle       # секреты не попали в браузерный бандл
```
