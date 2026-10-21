// Runs real Next route handlers in Vitest against the real local Supabase. `next/headers` is mocked
// with an in-memory cookie jar filled by a real password sign-in through @supabase/ssr.
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../../lib/database.types";
import { supabaseEnv } from "../../scripts/lib/world";

type Cookie = { name: string; value: string };
export const jar = new Map<string, string>();

export const cookieStore = {
  getAll: (): Cookie[] => [...jar].map(([name, value]) => ({ name, value })),
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); },
  delete: (name: string) => { jar.delete(name); },
};

export async function loginAs(email: string, password: string) {
  jar.clear();
  const { url, publishable } = supabaseEnv();
  const client = createServerClient<Database>(url, publishable, { cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (items) => { for (const { name, value } of items) cookieStore.set(name, value); },
  } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
}

export function logout() { jar.clear(); }

export const ORIGIN = "http://localhost:3000";

export function req(path: string, body?: unknown, opts: { method?: string; origin?: string | null; contentType?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (body !== undefined) headers["content-type"] = opts.contentType ?? "application/json";
  return new Request(`${ORIGIN}${path}`, { method: opts.method ?? (body === undefined ? "GET" : "POST"), headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

export function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) } as never;
}
