# Архитектурные решения

| ID | Решение | Причина |
|---|---|---|
| D-01 | Локальная разработка и все integration-тесты — на реальном локальном Supabase (Docker, CLI 2.121). | Шаг 2: RLS подтверждается только реальным Data API/RPC/Storage с JWT, не mock. |
| D-02 | `cacheComponents` выключен, все страницы динамические. | Tenant/user-данные не должны кэшироваться между пользователями (2.5); AI-маршруты экспортируют `runtime = "nodejs"` (5.2), что несовместимо с cacheComponents. |
| D-03 | `private.is_superadmin()` требует AAL2 (MFA). | SEC-10 / 5.4 «Superadmin + MFA». Без этого пароль superadmin давал глобальный доступ через Data API в обход proxy. |
| D-04 | Операции HR над черновиками (save/publish/clone/track) — SECURITY INVOKER RPC. | Права HR, RLS и immutable-триггеры применяются без обхода; атомарность обеспечена одной транзакцией функции. |
| D-05 | Операции, требующие записи в защищенные таблицы (приглашение, апелляция, сессии урока, тикеты, постановка job) — SECURITY DEFINER с явными проверками `can_manage`/`auth.uid()` и grant только `authenticated`. | 5.4: «реализуй SECURITY DEFINER RPC с явными grant/revoke и внутренними проверками». |
| D-06 | Worker-побочные эффекты — RPC только для `service_role`, каждая проверяет lease и активность tenant/actor (`private.assert_job`). | 3.9 и SEC-12. |
| D-07 | Сохранение черновика курса заменяет всех потомков с новыми ID. | Черновики не имеют progress/attempts; гарантирует отсутствие висячих FK и упрощает CAS. |
| D-08 | `/hr` доступен только `hr_admin`; superadmin работает с компанией через `/superadmin/tenants/[id]`. | E-SPEC-02. |
| D-09 | Seed-векторы — отдельный namespace `test-hash-embedding-v1`, детерминированные нормированные векторы. | 6.3 п.4: нельзя выдавать за semantic index; тьютор при реальной модели их не использует (фильтр по embedding_model). |
| D-10 | Антивирус: адаптер clamd (INSTREAM). Без `CLAMAV_HOST` загрузка остается в статусе «uploaded» с blocked stage `SCANNER_UNAVAILABLE`; обработка не начинается. | 2.4/шаг 5.2: нельзя помечать файл safe без проверки. |
