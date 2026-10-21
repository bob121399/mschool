# Build environment

Зафиксировано: 2026-10-20T13:13Z. Точные версии зависимостей — `package-lock.json` (`--save-exact`).

| Компонент | Версия |
|---|---|
| Node.js | v22.22.0 |
| npm | 10.9.4 |
| OS | Ubuntu 24.04.5 LTS |
| Docker Engine | 29.9.1 |
| Supabase CLI | 2.121.0 |
| PostgreSQL (local Supabase) | 17.11 |
| next | 16.4.2 |
| react | 19.3.0 |
| react-dom | 19.3.0 |
| @supabase/supabase-js | 2.118.0 |
| @supabase/ssr | 0.12.7 |
| zod | 4.6.7 |
| tailwindcss | 4.3.3 |
| @tailwindcss/postcss | 4.3.3 |
| typescript | 5.9.3 |
| vitest | 5.0.5 |
| @playwright/test | 1.64.1 |
| pdfjs-dist | 6.4.299 |
| next-themes | 0.4.6 |
| react-markdown | 10.1.0 |
| rehype-sanitize | 6.0.0 |

Образы локального Supabase загружаются из public.ecr.aws (Docker Hub в этой среде отвечал 429).
`cacheComponents` выключен (decisions D-02).

Дополнительно: `@pdf-lib/fontkit` (dev, генерация PDF-fixtures с кириллицей шрифтом DejaVu Sans из системы),
Chromium для Playwright — предустановленный `/opt/pw-browsers/chromium` (`PW_EXECUTABLE_PATH`).
ClamAV 1.5.4 установлен из apt, но сигнатуры недоступны (сетевая политика), поэтому сканер не запущен (BLK-02).
