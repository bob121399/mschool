import { z } from "zod";
import { route } from "@/lib/api";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  tenantId: z.uuid(), tier: z.enum(["start", "growth", "enterprise"]), currency: z.enum(["USD", "UZS"]),
  seatPriceMinor: z.number().int().min(0), minimumMinor: z.number().int().min(0),
  periodStart: z.iso.date(), periodEnd: z.iso.date(),
  contract: z.object({ reference: z.string().max(120), fx_source: z.string().max(200).optional(), fx_date: z.iso.date().optional(),
    fair_use: z.string().max(1000).optional() }).strict(),
  reason: z.string().trim().min(10).max(500),
}).strict();

// Price and currency are frozen in the subscription snapshot; price list changes never rewrite invoices.
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 8192));
  const { db } = await superadminContext();
  const { data, error } = await db.rpc("admin_create_subscription", { p_tenant: input.tenantId, p_tier: input.tier,
    p_currency: input.currency, p_seat_price_minor: input.seatPriceMinor, p_minimum_minor: input.minimumMinor,
    p_period_start: input.periodStart, p_period_end: input.periodEnd, p_contract: input.contract, p_reason: input.reason });
  if (error) databaseError(error);
  return json({ subscriptionId: data }, 201);
}, { mutation: true });
