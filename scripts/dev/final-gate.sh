#!/usr/bin/env bash
# Final gate (spec 6 step 6.7): runs the mandatory command list in order and records real exit codes.
# Local only: `supabase db reset` wipes the LOCAL database.
cd "$(dirname "$0")/../.."
LOG=.secrets/final-gate
mkdir -p "$LOG"
SUMMARY="$LOG/summary.tsv"
: > "$SUMMARY"
export PW_EXECUTABLE_PATH=${PW_EXECUTABLE_PATH:-/opt/pw-browsers/chromium}

run() {
  local name="$1"; shift
  local start=$(date +%s)
  bash -c "$*" > "$LOG/$name.log" 2>&1
  local code=$?
  echo -e "$name\t$code\t$(( $(date +%s) - start ))s\t$*" | tee -a "$SUMMARY"
  return 0
}

(fuser -k 3000/tcp >/dev/null 2>&1; true)
run npm_ci "npm ci --no-audit --no-fund"
run db_reset "npx supabase db reset"
run gen_types "npx supabase gen types typescript --local > lib/database.types.ts && git diff --exit-code --stat lib/database.types.ts"
run seed "ALLOW_SEED=true npm run seed"
run typecheck "npm run typecheck"
run lint "npm run lint"
run test_unit "npm run test"
run test_integration "npm run test:integration"
run test_evals "npm run test:evals"
run build "npm run build"
run check_bundle "npm run check:bundle"
run test_e2e "npm run test:e2e -- --reporter=line"
(fuser -k 3000/tcp >/dev/null 2>&1; true)
echo "DONE" >> "$SUMMARY"
