import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { HttpError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  userIds: z.array(z.uuid()).min(1).max(500),
  trackId: z.uuid(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();

// Each assignment is atomic on its own; the response lists every outcome (no hidden partial success).
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 64_000));
  const { db } = await hrContext();
  const results: { userId: string; ok: boolean; assignmentId?: string; code?: string }[] = [];
  for (const userId of [...new Set(input.userIds)]) {
    const { data, error } = await db.rpc("assign_track", { p_user: userId, p_track: input.trackId,
      p_due_at: input.dueAt ?? undefined });
    if (error) {
      const code = /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "ASSIGN_FAILED";
      results.push({ userId, ok: false, code });
    } else results.push({ userId, ok: true, assignmentId: data });
  }
  if (results.every((r) => !r.ok) && results.every((r) => r.code === "FORBIDDEN")) throw new HttpError(403, "FORBIDDEN");
  return json({ assigned: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}, { mutation: true });
