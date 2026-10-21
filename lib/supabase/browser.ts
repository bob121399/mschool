"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser client: publishable key only. Used for Auth flows and direct-to-Storage upload of an
// already authorized document path; all business reads/writes go through route handlers.
export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("CONFIG_MISSING:NEXT_PUBLIC_SUPABASE_URL");
  return createBrowserClient<Database>(url, key);
}
