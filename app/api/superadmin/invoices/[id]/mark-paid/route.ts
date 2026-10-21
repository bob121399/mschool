import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  paidAt: z.iso.datetime({ offset: true }),
  paymentReference: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(10).max(500),
}).strict();

// Human payment confirmation (MVP invoice billing). Unique reference; audit in SQL.
export async function POST(request: Request, ctx: RouteContext<"/api/superadmin/invoices/[id]/mark-paid">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 2048));
    const { db } = await superadminContext();
    const { error } = await db.rpc("mark_invoice_paid", { p_invoice: id, p_reference: input.paymentReference,
      p_paid_at: input.paidAt, p_reason: input.reason });
    if (error) databaseError(error);
    return json({ status: "paid" });
  } catch (error) {
    return publicError(error, traceId);
  }
}
