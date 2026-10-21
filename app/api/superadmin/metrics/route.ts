import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { superadminContext } from "@/lib/auth/context";
import { json } from "@/lib/http";
import { platformMetrics } from "@/lib/billing/platform";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const params = searchParams(request);
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u).parse(params.get("month"));
  const currency = z.enum(["USD", "UZS"]).default("USD").parse(params.get("currency") ?? undefined);
  const { db } = await superadminContext();
  return json(await platformMetrics(db, month, currency));
}, { mutation: false });
