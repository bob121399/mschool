import type { NextRequest } from "next/server";
import { middleware } from "@/lib/auth/middleware";

export function proxy(request: NextRequest) {
  return middleware(request);
}
// ERRATA E-TS-07: the listing matched only protected paths, so public pages (login, onboarding,
// auth callback, forbidden) received no CSP nonce. Auth rules still apply only to protected
// prefixes inside lib/auth/middleware.ts.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
