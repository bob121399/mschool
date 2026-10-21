import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;
export type Job = Database["public"]["Tables"]["agent_jobs"]["Row"];

export function workerDb(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("CONFIG_MISSING:SUPABASE");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export type JobContext = {
  db: Db;
  job: Job;
  lease: string;
  log: (event: string, fields?: Record<string, unknown>) => void;
};

export type JobOutcome = { status: "succeeded" | "needs_review"; result: Json };

export async function recordAgentRun(ctx: JobContext, agent: string, payload: Record<string, unknown>, started: number) {
  await ctx.db.rpc("record_agent_run", { p_tenant: ctx.job.tenant_id as string, p_actor: ctx.job.actor_id as string,
    p_agent: agent, p_payload: { job_id: ctx.job.id, ...payload } as Json, p_ms: Date.now() - started });
}

/** Maps a provider HttpError-like failure to job semantics. */
export function isTransient(code: string): boolean {
  return ["AI_UNAVAILABLE", "AI_BUSY", "AI_INVALID_RESPONSE", "AI_INCOMPLETE", "AI_INVALID_JSON", "AI_SCHEMA_MISMATCH",
    "EMBEDDING_INVALID", "DATABASE_UNAVAILABLE", "STORAGE_UNAVAILABLE"].includes(code);
}
