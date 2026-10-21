import { route } from "@/lib/api";
import { noContent } from "@/lib/http";
import { userDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  const db = await userDb();
  await db.auth.signOut({ scope: "local" });
  return noContent();
}, { mutation: true });
