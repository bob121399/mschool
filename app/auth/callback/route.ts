import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

// PKCE code exchange (OAuth/SSO-ready). One-time code → session; local redirect only.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/login", process.env.APP_ORIGIN);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  if (!code) return NextResponse.redirect(new URL("/login?error=link", origin));
  const db = await userDb();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=link", origin));
  return NextResponse.redirect(new URL(next, origin));
}
