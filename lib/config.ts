export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CONFIG_MISSING:${name}`);
  return value;
}

export function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Variables the web process cannot start without (spec 6 step 1.5). AI variables are checked
 * per call: a missing key yields an explicit AI_NOT_CONFIGURED error, never a mock provider. */
export const WEB_REQUIRED_ENV = [
  "APP_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

export const AI_ENV = [
  "OPENAI_API_KEY",
  "OPENAI_TUTOR_MODEL",
  "OPENAI_ASSESSOR_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "OPENAI_WORKER_MODEL",
] as const;

export type ConfigReport = { missing: string[]; aiMissing: string[]; invalid: string[] };

export function validateConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const missing = WEB_REQUIRED_ENV.filter((name) => !env[name]?.trim());
  const aiMissing = AI_ENV.filter((name) => !env[name]?.trim());
  const invalid: string[] = [];
  for (const name of ["APP_ORIGIN", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
    const value = env[name]?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") invalid.push(name);
    } catch {
      invalid.push(name);
    }
  }
  return { missing, aiMissing, invalid };
}

export function aiConfigured(): boolean {
  return validateConfig().aiMissing.length === 0;
}
