import { HttpError } from "@/lib/http";
import type { Json } from "@/lib/database.types";
import { isTransient, type Db, type Job, type JobContext, type JobOutcome } from "./context";
import { PermanentJobError, TransientJobError } from "./errors";
import { ingestion } from "./handlers/ingestion";
import { courseCreator } from "./handlers/course-creator";
import { hrAnalyst } from "./handlers/hr-analyst";
import { support } from "./handlers/support";
import { productAnalyst } from "./handlers/product-analyst";
import { sales } from "./handlers/sales";

export const HANDLERS: Record<string, (ctx: JobContext) => Promise<JobOutcome>> = {
  ingestion, course_creator: courseCreator, hr_analyst: hrAnalyst, support, product_analyst: productAnalyst, sales,
};
export const JOB_TYPES = Object.keys(HANDLERS);

export function log(event: string, fields: Record<string, unknown> = {}) {
  // IDs and codes only: no document text, answers, emails or secrets.
  console.log(JSON.stringify({ ts: new Date().toISOString(), component: "worker", event, ...fields }));
}

function backoffSeconds(attempt: number): number {
  const base = Math.min(600, 15 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + Math.random() * base / 2);
}

/** Runs one claimed job to a terminal or retry state. Never throws. */
export async function runJob(db: Db, job: Job) {
  const lease = job.lease_token!;
  const ctx: JobContext = { db, job, lease, log: (e, f) => log(e, { job_id: job.id, ...f }) };
  const heartbeat = setInterval(() => {
    void db.rpc("heartbeat_job", { p_job: job.id, p_lease: lease }).then(({ data }) => {
      if (data === false) log("lease_lost", { job_id: job.id });
    });
  }, 20_000);
  const started = Date.now();
  try {
    const handler = HANDLERS[job.agent_type];
    if (!handler) throw new PermanentJobError("UNKNOWN_JOB_TYPE");
    const outcome = await handler(ctx);
    await db.rpc("finish_job", { p_job: job.id, p_lease: lease, p_status: outcome.status, p_result: outcome.result as Json });
    log("job_finished", { job_id: job.id, type: job.agent_type, status: outcome.status, ms: Date.now() - started });
  } catch (error) {
    const code = error instanceof PermanentJobError || error instanceof TransientJobError || error instanceof HttpError
      ? (error as { code: string }).code : "INTERNAL_ERROR";
    if (error instanceof PermanentJobError || code === "AI_NOT_CONFIGURED" || ["TENANT_INACTIVE", "ACTOR_INACTIVE", "STALE_LEASE"].includes(code)) {
      const status = error instanceof PermanentJobError ? error.status : "failed";
      await db.rpc("finish_job", { p_job: job.id, p_lease: lease, p_status: status, p_result: { error_code: code }, p_error: code });
      log("job_stopped", { job_id: job.id, type: job.agent_type, code, status });
    } else {
      const transient = error instanceof TransientJobError || isTransient(code) || code === "INTERNAL_ERROR";
      const outcome = await db.rpc("retry_job", { p_job: job.id, p_lease: lease, p_error: code,
        p_delay_seconds: transient ? backoffSeconds(job.attempts) : 1 });
      log("job_retry", { job_id: job.id, type: job.agent_type, code, outcome: outcome.data });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

