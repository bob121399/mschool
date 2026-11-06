"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser client: publishable key only. Used for Auth flows and direct-to-Storage upload of an
// already authorized document path; all business reads/writes go through route handlers.
export function browserDb() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!raw || !key) throw new Error("CONFIG_MISSING:NEXT_PUBLIC_SUPABASE_URL");
  // "/" = same-origin mode (lib/supabase/url.ts); the cookie name must match the server's.
  if (raw === "/") return createBrowserClient<Database>(window.location.origin, key, { cookieOptions: { name: "sb-mschool-auth-token" } });
  return createBrowserClient<Database>(raw, key);
}
