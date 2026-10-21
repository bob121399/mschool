import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { requiredEnv } from "@/lib/config";

export async function userDb() {
  const jar = await cookies();
  return createServerClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items) jar.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; proxy performs refresh there.
          }
        },
      },
    },
  );
}

export type UserDb = Awaited<ReturnType<typeof userDb>>;
