import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";
const TYPES: EmailOtpType[] = ["invite", "email", "signup", "recovery", "magiclink", "email_change"];

// Email links (templates in supabase/templates) carry a one-time token_hash; the server verifies it
// and sets the session cookie. Redirect target is restricted to a local pathname.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), "/login", process.env.APP_ORIGIN);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  if (!tokenHash || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }
  const db = await userDb();
  const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/login?error=link", origin));
  return NextResponse.redirect(new URL(next, origin));
}
