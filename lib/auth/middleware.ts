import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { requiredEnv } from "@/lib/config";

// ERRATA E-TS-06/07 (docs/spec-errata.md): the listing redirected verified users without a
// profile to /forbidden (onboarding and invitation acceptance became unreachable), had no
// AAL2 check for superadmin, and only ran on protected paths so pages had no CSP nonce.

export function buildCsp(nonce: string, dev: boolean): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const connect = ["'self'", supabase].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_ORIGIN?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const PROTECTED = ["/superadmin", "/hr", "/learn", "/onboarding", "/mfa", "/support",
  "/api/superadmin", "/api/hr", "/api/me", "/api/agents", "/api/support"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const prefix = (value: string) => path === value || path.startsWith(value + "/");
  const api = path.startsWith("/api/");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  const carry = (target: NextResponse) => {
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set("Content-Security-Policy", csp);
    target.headers.set("Cache-Control", "private, no-store");
    target.headers.set("Pragma", "no-cache");
    target.headers.set("Expires", "0");
    return target;
  };
  const isProtected = PROTECTED.some(prefix);
  if (!isProtected && path !== "/login") {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }
  const deny = (status: number, code: string) => {
    if (api) return carry(NextResponse.json({ error: { code } }, { status }));
    if (status === 401) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", path);
      return carry(NextResponse.redirect(url));
    }
    if (code === "MFA_REQUIRED") return carry(NextResponse.redirect(new URL("/mfa", request.url)));
    if (code === "PROFILE_REQUIRED") return carry(NextResponse.redirect(new URL("/onboarding", request.url)));
    return carry(NextResponse.redirect(new URL(status === 403 ? "/forbidden" : "/unavailable", request.url)));
  };
  try {
    const db = createServerClient<Database>(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      { cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          for (const { name, value } of items) request.cookies.set(name, value);
          const previousCookies = response.cookies.getAll();
          response = forward();
          for (const cookie of previousCookies) response.cookies.set(cookie);
          for (const { name, value, options } of items) response.cookies.set(name, value, options);
        },
      } },
    );
    const { data: auth, error } = await db.auth.getUser();
    if (error || !auth.user) return path === "/login" ? carry(response) : deny(401, "UNAUTHENTICATED");
    const { data: profile, error: profileError } = await db.from("users")
      .select("role,tenant_id,status").eq("id", auth.user.id).maybeSingle();
    if (profileError) return deny(503, "DATABASE_UNAVAILABLE");
    if (!profile) {
      // RLS hides the row both for "no profile yet" and for a suspended user/inactive tenant; only the
      // former may reach onboarding (ERRATA E-TS-19).
      const { data: state, error: stateError } = await db.rpc("my_access_state");
      if (stateError) return deny(503, "DATABASE_UNAVAILABLE");
      if (state !== "no_profile") return deny(403, "FORBIDDEN");
      // Verified Auth user without a profile: only onboarding/invitation pages are reachable.
      if (prefix("/onboarding") || path === "/login") {
        return path === "/login" ? deny(403, "PROFILE_REQUIRED") : carry(response);
      }
      return api ? deny(403, "FORBIDDEN") : deny(403, "PROFILE_REQUIRED");
    }
    if (profile.status !== "active") return deny(403, "FORBIDDEN");
    const role = profile.role;
    if (prefix("/onboarding") && !prefix("/onboarding/done")) {
      return carry(NextResponse.redirect(new URL(home(role), request.url)));
    }
    if ((prefix("/superadmin") || prefix("/api/superadmin")) && role !== "superadmin") return deny(403, "FORBIDDEN");
    if ((prefix("/hr") || prefix("/api/hr")) && role !== "hr_admin") return deny(403, "FORBIDDEN");
    if ((prefix("/learn") || prefix("/api/me") || prefix("/api/agents/tutor") || prefix("/api/agents/assessor"))
      && role !== "employee") return deny(403, "FORBIDDEN");
    if (role === "superadmin" && !prefix("/mfa")) {
      const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") return deny(403, "MFA_REQUIRED");
    }
    if (path === "/login") {
      return carry(NextResponse.redirect(new URL(home(role), request.url)));
    }
    return carry(response);
  } catch {
    return deny(503, "AUTH_UNAVAILABLE");
  }
}

export function home(role: "superadmin" | "hr_admin" | "employee"): string {
  return role === "superadmin" ? "/superadmin" : role === "hr_admin" ? "/hr" : "/learn";
}
