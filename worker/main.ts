// Durable worker (spec 3.9): separate Node process, concurrency limit, claim via
// FOR UPDATE SKIP LOCKED (claim_job), heartbeat 20 s / lease 90 s, ≤3 attempts with exponential
// backoff + jitter, scheduler tick every minute, graceful shutdown on SIGTERM/SIGINT.
import { existsSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { workerDb } from "./context";
import { JOB_TYPES, log, runJob } from "./process";

if (existsSync(".env.local") && !process.env.SUPABASE_SECRET_KEY) loadEnvFile(".env.local");

const concurrency = Math.max(1, Math.min(8, Number(process.env.WORKER_CONCURRENCY ?? 2)));
const db = workerDb();
let stopping = false;
const running = new Set<Promise<void>>();

function touchHeartbeat() {
  // Container liveness probe (Dockerfile HEALTHCHECK); failures are non-fatal.
  try { writeFileSync("/tmp/worker-heartbeat", String(Date.now())); } catch { /* read-only fs */ }
}

async function claimLoop() {
  while (!stopping) {
    touchHeartbeat();
    if (running.size >= concurrency) { await Promise.race(running); continue; }
    const { data, error } = await db.rpc("claim_job", { p_types: JOB_TYPES });
    if (error) { log("claim_error", { code: error.code }); await sleep(5000); continue; }
    const job = data?.[0];
    if (!job) { await sleep(2000); continue; }
    log("job_claimed", { job_id: job.id, type: job.agent_type, attempt: job.attempts });
    const p = runJob(db, job).finally(() => running.delete(p));
    running.add(p);
  }
}

async function schedulerLoop() {
  while (!stopping) {
    const { data, error } = await db.rpc("schedule_periodic_jobs");
    if (error) log("scheduler_error", { code: error.code });
    else log("scheduler_tick", data as Record<string, unknown>);
    for (let i = 0; i < 60 && !stopping; i += 1) await sleep(1000);
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("shutdown", { signal, running: running.size });
  // Unfinished jobs keep their lease until it expires; another worker reclaims them.
  await Promise.race([Promise.allSettled([...running]), sleep(60_000)]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("start", { concurrency, types: JOB_TYPES });
void claimLoop();
if (process.env.WORKER_SCHEDULER !== "false") void schedulerLoop();
