#!/usr/bin/env bash
# Runs the Next.js standalone server exactly as the Docker `web` target does (output: "standalone").
# `next start` is not the supported runner for standalone output.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .next/standalone/server.js ] || { echo "run npm run build first" >&2; exit 2; }
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
ENV_ARGS=()
[ -f .env.local ] && ENV_ARGS=(--env-file=.env.local)
exec env PORT="${PORT:-3000}" HOSTNAME="${HOSTNAME_BIND:-localhost}" node "${ENV_ARGS[@]}" .next/standalone/server.js
