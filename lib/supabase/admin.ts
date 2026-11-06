import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requiredEnv } from "@/lib/config";
import { supabaseServerUrl } from "@/lib/supabase/url";

export function adminDb() {
  return createClient<Database>(
    supabaseServerUrl(),
    requiredEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

export type AdminDb = ReturnType<typeof adminDb>;
