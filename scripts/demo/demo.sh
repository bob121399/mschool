#!/usr/bin/env bash
# One-command LOCAL demo: local Supabase → clean DB + synthetic seed → production build → web + worker.
# Never touches remote projects: env.ts and the seed refuse non-local Supabase hosts.
#   npm run demo                 # full clean start (data and passwords are regenerated)
#   npm run demo -- --keep-data  # restart without resetting the DB
#   npm run demo -- --skip-build # reuse the previous build
set -euo pipefail
cd "$(dirname "$0")/../.."

KEEP_DATA=false; SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --keep-data) KEEP_DATA=true ;;
    --skip-build) SKIP_BUILD=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

step "Проверка окружения"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail "Нужен Node.js 22+ (сейчас $(node -v))"
docker info >/dev/null 2>&1 || fail "Docker не запущен. Запустите Docker Desktop и повторите."
if command -v fuser >/dev/null 2>&1 && fuser 3000/tcp >/dev/null 2>&1; then fail "Порт 3000 занят. Остановите другой сервер."; fi
[ -d node_modules ] || { step "Установка зависимостей"; npm ci --no-audit --no-fund; }

step "Локальный Supabase (первый запуск скачивает образы, ~5–10 мин)"
npx supabase start >/dev/null
npx supabase status -o env | npx tsx scripts/demo/env.ts

if [ "$KEEP_DATA" = false ] || [ ! -f .secrets/seed-credentials.json ]; then
  step "Чистая база и демо-данные"
  npx supabase db reset >/dev/null
  ALLOW_SEED=true npm run --silent seed
fi

if [ "$SKIP_BUILD" = false ] || [ ! -f .next/standalone/server.js ]; then
  step "Сборка приложения"
  npm run --silent build >/dev/null
fi

mkdir -p .demo
step "Фоновый worker (лог: .demo/worker.log)"
npm run --silent worker:start >.demo/worker.log 2>&1 &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT INT TERM

npx tsx scripts/demo/card.ts
step "Сервер запущен: http://localhost:3000  (остановка — Ctrl+C)"
bash scripts/start-standalone.sh
