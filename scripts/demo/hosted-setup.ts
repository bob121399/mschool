// Sets up the HOSTED DEMO: a dedicated Supabase project (created if needed) + a Vercel project for the
// Next.js app. Synthetic data only. Refuses any Supabase project whose name lacks "demo" and seeds only
// into a project with no tenants, so it cannot touch an environment with real customers.
// The durable worker is not hosted on Vercel: background jobs (new uploads, weekly reports) stay queued.
//
// Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, VERCEL_TOKEN.
// Optional env: DEMO_SUPABASE_PROJECT_REF (else a project "mschool-demo" is found or created),
//   SUPABASE_ORG_SLUG / VERCEL_TEAM_ID (when the account has several), OPENAI_* (live AI).
// Run: npm run demo:hosted
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SB = "https://api.supabase.com/v1";
const VERCEL = "https://api.vercel.com";
const VERCEL_CLI = "vercel@65.0.0";
const PROJECT_NAME = "mschool-demo";
const CREDS = ".secrets/hosted-demo-credentials.json";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
const opt = (name: string) => process.env[name]?.trim() || undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (msg: string) => console.log(`\n▶ ${msg}`);

async function api<T>(base: string, token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${base}${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

type Project = { id?: string; ref?: string; name: string; status: string; organization_slug?: string };

async function supabaseProject(token: string, dbPassword: string): Promise<Project & { ref: string }> {
  const projects = await api<Project[]>(SB, token, "GET", "/projects");
  const refOf = (p: Project) => (p.ref ?? p.id)!;
  const wanted = opt("DEMO_SUPABASE_PROJECT_REF");
  let project = wanted ? projects.find((p) => refOf(p) === wanted) : projects.find((p) => p.name === PROJECT_NAME);
  if (wanted && !project) throw new Error(`Project ${wanted} not found for this token`);
  if (!project) {
    const orgs = await api<{ slug: string; name: string }[]>(SB, token, "GET", "/organizations");
    const slug = opt("SUPABASE_ORG_SLUG") ?? (orgs.length === 1 ? orgs[0]!.slug : undefined);
    if (!slug) throw new Error(`Several organizations (${orgs.map((o) => o.slug).join(", ")}): set SUPABASE_ORG_SLUG`);
    step(`Создание проекта Supabase «${PROJECT_NAME}» (eu-central-1)`);
    project = await api<Project>(SB, token, "POST", "/projects", {
      name: PROJECT_NAME, organization_slug: slug, db_pass: dbPassword, region: "eu-central-1",
    });
  }
  if (!/demo/iu.test(project.name)) throw new Error(`Refusing: project "${project.name}" is not a demo project (name must contain "demo")`);
  const ref = refOf(project);
  for (let i = 0; i < 90; i += 1) {
    const p = await api<Project>(SB, token, "GET", `/projects/${ref}`);
    if (p.status === "ACTIVE_HEALTHY") return { ...p, ref };
    if (i === 0) step(`Ожидание готовности проекта ${ref} (статус ${p.status})`);
    await sleep(10_000);
  }
  throw new Error(`Project ${ref} did not become ACTIVE_HEALTHY in 15 minutes`);
}

function cli(args: string[], extraEnv: Record<string, string>) {
  const r = spawnSync("npx", ["supabase", ...args], { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) throw new Error(`supabase ${args.join(" ")} failed (exit ${r.status})`);
}

function template(name: string) {
  return readFileSync(`supabase/templates/${name}.html`, "utf8");
}

type Vercel = { token: string; teamId: string; projectId: string };

async function vercelProject(token: string): Promise<Vercel> {
  const teams = await api<{ teams: { id: string; slug: string }[] }>(VERCEL, token, "GET", "/v2/teams");
  const teamId = opt("VERCEL_TEAM_ID") ?? (teams.teams.length === 1 ? teams.teams[0]!.id : undefined);
  if (!teamId) throw new Error(`Several Vercel teams (${teams.teams.map((t) => `${t.slug}=${t.id}`).join(", ")}): set VERCEL_TEAM_ID`);
  const q = `teamId=${encodeURIComponent(teamId)}`;
  let id: string;
  try {
    id = (await api<{ id: string }>(VERCEL, token, "GET", `/v9/projects/${PROJECT_NAME}?${q}`)).id;
  } catch (error) {
    if (!String(error).includes("→ 404")) throw error;
    step(`Создание проекта Vercel «${PROJECT_NAME}»`);
    id = (await api<{ id: string }>(VERCEL, token, "POST", `/v11/projects?${q}`, { name: PROJECT_NAME, framework: "nextjs" })).id;
  }
  return { token, teamId, projectId: id };
}

async function vercelEnv(v: Vercel, values: Record<string, string>) {
  const body = Object.entries(values).map(([key, value]) => ({ key, value, type: "encrypted", target: ["production"] }));
  const res = await api<{ failed: unknown[] }>(VERCEL, v.token, "POST", `/v10/projects/${v.projectId}/env?upsert=true&teamId=${v.teamId}`, body);
  if (res.failed.length) throw new Error(`Vercel env: ${JSON.stringify(res.failed).slice(0, 300)}`);
}

async function vercelOrigin(v: Vercel): Promise<string | undefined> {
  const res = await api<{ domains: { name: string }[] }>(VERCEL, v.token, "GET", `/v9/projects/${v.projectId}/domains?teamId=${v.teamId}`);
  const domain = res.domains.find((d) => d.name.endsWith(".vercel.app"))?.name ?? res.domains[0]?.name;
  return domain ? `https://${domain}` : undefined;
}

function vercelDeploy(v: Vercel) {
  step("Сборка и публикация на Vercel (~3–5 минут)");
  const r = spawnSync("npx", ["--yes", VERCEL_CLI, "deploy", "--prod", "--yes", "--token", v.token], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, VERCEL_ORG_ID: v.teamId, VERCEL_PROJECT_ID: v.projectId, VERCEL_TELEMETRY_DISABLED: "1" },
  });
  if (r.status !== 0) throw new Error(`vercel deploy failed (exit ${r.status})`);
  return r.stdout.toString().trim();
}

async function main() {
  const token = env("SUPABASE_ACCESS_TOKEN");
  const dbPassword = env("SUPABASE_DB_PASSWORD");
  const vercel = await vercelProject(env("VERCEL_TOKEN"));

  const project = await supabaseProject(token, dbPassword);
  const ref = project.ref;
  const url = `https://${ref}.supabase.co`;

  step("Миграции");
  const cliEnv = { SUPABASE_ACCESS_TOKEN: token, SUPABASE_DB_PASSWORD: dbPassword };
  cli(["link", "--project-ref", ref], cliEnv);
  cli(["db", "push", "--linked", "--yes"], cliEnv);

  type Key = { api_key: string | null; type: string | null; name: string };
  const keys = await api<Key[]>(SB, token, "GET", `/projects/${ref}/api-keys?reveal=true`);
  const publishable = keys.find((k) => k.type === "publishable")?.api_key;
  const secret = keys.find((k) => k.type === "secret")?.api_key;
  if (!publishable || !secret) throw new Error("Project has no publishable/secret API keys: create them in Supabase → Settings → API Keys");

  const appEnv: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    SUPABASE_SECRET_KEY: secret,
    MSCHOOL_DEMO_MODE: "true",
    OPENAI_EMBEDDING_MODEL: opt("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small",
  };
  for (const name of ["OPENAI_API_KEY", "OPENAI_TUTOR_MODEL", "OPENAI_ASSESSOR_MODEL", "OPENAI_WORKER_MODEL"]) {
    const v = opt(name);
    if (v) appEnv[name] = v;
  }

  mkdirSync(".secrets", { recursive: true });
  if (existsSync(CREDS)) {
    step(`Демо-данные уже созданы ранее (${CREDS}) — пропуск`);
  } else {
    step("Синтетические демо-данные");
    const r = spawnSync("npx", ["tsx", "--conditions=react-server", "scripts/seed.ts"], {
      stdio: "inherit",
      env: { ...process.env, ...appEnv, ALLOW_SEED: "true", SEED_REMOTE_DEMO_CONFIRM: `SEED SYNTHETIC DEMO INTO ${ref}`, SEED_CREDENTIALS_FILE: CREDS },
    });
    if (r.status !== 0) throw new Error(`seed failed (exit ${r.status})`);
  }

  // The production *.vercel.app domain exists only after the first production deployment.
  await vercelEnv(vercel, appEnv);
  let origin = await vercelOrigin(vercel);
  if (!origin) {
    vercelDeploy(vercel);
    origin = await vercelOrigin(vercel);
    if (!origin) throw new Error("Vercel project has no domain after the first deployment");
  }

  step("Настройки входа (адрес сайта, MFA, шаблоны писем, регистрация закрыта)");
  await api(SB, token, "PATCH", `/projects/${ref}/config/auth`, {
    site_url: origin,
    uri_allow_list: `${origin}/auth/callback,${origin}/auth/confirm`,
    // Public demo link: strangers must not create companies; accounts come from the seed only.
    disable_signup: true,
    password_min_length: 12,
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
    mailer_subjects_invite: "Приглашение в MSchool",
    mailer_subjects_confirmation: "Подтвердите email для MSchool",
    mailer_subjects_recovery: "Восстановление пароля MSchool",
    mailer_subjects_magic_link: "Вход в MSchool",
    mailer_templates_invite_content: template("invite"),
    mailer_templates_confirmation_content: template("confirmation"),
    mailer_templates_recovery_content: template("recovery"),
    mailer_templates_magic_link_content: template("magic_link"),
  });

  // APP_ORIGIN is read at build time (HSTS) and at runtime (Origin checks): deploy after setting it.
  await vercelEnv(vercel, { APP_ORIGIN: origin });
  vercelDeploy(vercel);

  const health = await fetch(`${origin}/api/health`).then((r) => r.status).catch(() => 0);
  const creds = JSON.parse(readFileSync(CREDS, "utf8")) as { password: string; accounts: Record<string, string>; superadmin_totp_secret: string };
  const card = [
    "MSchool — демо в интернете (синтетические данные)",
    `Адрес:         ${origin}   (health: ${health})`,
    `Пароль (все):  ${creds.password}`,
    `Сотрудник:     ${creds.accounts.emp_a_junior1}`,
    `HR (A / B):    ${creds.accounts.hr_a} / ${creds.accounts.hr_b}`,
    `Суперадмин:    ${creds.accounts.superadmin}  — TOTP-секрет: ${creds.superadmin_totp_secret}`,
    `Supabase:      ${ref}`,
  ].join("\n");
  writeFileSync(".secrets/hosted-demo-access.txt", `${card}\n`, { mode: 0o600 });
  console.log(`\n${card}\n\n(сохранено в .secrets/hosted-demo-access.txt)`);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
