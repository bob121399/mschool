import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Own tenant subscription and invoices; every amount carries its currency.
export const GET = route(async () => {
  const { db, tenantId } = await hrContext();
  const [subs, invoices] = await Promise.all([
    db.from("subscriptions").select("id,status,tier,currency,seat_price_minor,minimum_monthly_minor,period_start,period_end,billing_timezone,grace_days")
      .eq("tenant_id", tenantId).order("period_start", { ascending: false }).limit(24),
    db.from("invoices").select("id,period_start,period_end,active_seats,amount_minor,currency,status,paid_at")
      .eq("tenant_id", tenantId).order("period_start", { ascending: false }).limit(100),
  ]);
  if (subs.error) databaseError(subs.error);
  if (invoices.error) databaseError(invoices.error);
  return json({ subscriptions: subs.data, invoices: invoices.data });
}, { mutation: false });
