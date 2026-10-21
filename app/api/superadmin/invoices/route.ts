import { z } from "zod";
import { route } from "@/lib/api";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ tenantId: z.uuid(), periodStart: z.iso.date() }).strict();

// Idempotent per tenant/period: a repeat returns the existing invoice.
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 512));
  const { db } = await superadminContext();
  const { data, error } = await db.rpc("generate_invoice", { p_tenant: input.tenantId, p_period_start: input.periodStart });
  if (error) databaseError(error);
  return json({ invoiceId: data }, 201);
}, { mutation: true });
