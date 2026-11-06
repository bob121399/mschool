import { requiredEnv } from "@/lib/config";

// Same-origin mode (demo gateway, scripts/demo/gateway.mjs): NEXT_PUBLIC_SUPABASE_URL="/" means the
// browser reaches Supabase through the app's own origin, so a preview proxy that exposes one port is
// enough. Server code then talks to SUPABASE_INTERNAL_URL directly. The auth cookie gets a fixed name
// because @supabase/ssr derives it from the URL host, which differs between browser and server here.
export const SAME_ORIGIN_AUTH_COOKIE = "sb-mschool-auth-token";

export function supabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL?.trim() || requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function authCookieOptions(): { name: string } | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL === "/" ? { name: SAME_ORIGIN_AUTH_COOKIE } : undefined;
}
