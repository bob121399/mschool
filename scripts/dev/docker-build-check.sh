#!/usr/bin/env bash
# Builds the web and worker images locally (no push) to verify the Dockerfile targets.
# Host networking lets the build reach the local Supabase for nothing but keeps npm registry access
# identical to the host (registry.npmjs.org is reachable directly in the sandbox).
set -euo pipefail
cd "$(dirname "$0")/../.."
. <(npx supabase status -o env 2>/dev/null | sed 's/^/export /')
for target in web worker; do
  docker build --network host --target "$target" -t "mschool-$target:local" \
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=$API_URL" --build-arg "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY" \
    --build-arg APP_VERSION=local-docker .
done
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep mschool-
