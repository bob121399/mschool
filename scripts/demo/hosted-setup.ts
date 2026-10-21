// Sets up the HOSTED DEMO: a dedicated Supabase project (created if needed) + the Render services from
// render.yaml. Synthetic data only. Refuses any Supabase project whose name lacks "demo" and seeds only
// into a project with no tenants, so it cannot touch an environment with real customers.
//
// Required env: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD.
// Optional env: DEMO_SUPABASE_PROJECT_REF (else a project "mschool-demo" is found or created),
//   SUPABASE_ORG_SLUG (when the account has several organizations), RENDER_API_KEY (sets service env
//   vars and triggers deploys), DEMO_APP_ORIGIN (default: the Render web service URL), OPENAI_* (live AI).
// Run: npx tsx --conditions=react-server scripts/demo/hosted-setup.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SB = "https://api.supabase.com/v1";
const RENDER = "https://api.render.com/v1";
const PROJECT_NAME = "mschool-demo";
const WEB = "mschool-demo";
const WORKER = "mschool-demo-worker";
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

async function main() {
  const token = env("SUPABASE_ACCESS_TOKEN");
  const dbPassword = env("SUPABASE_DB_PASSWORD");
  const renderKey = opt("RENDER_API_KEY");

  let renderWeb: { id: string; url?: string } | undefined;
  let renderWorker: { id: string } | undefined;
  if (renderKey) {
    type Item = { service: { id: string; name: string; serviceDetails?: { url?: string } } };
    const items = await api<Item[]>(RENDER, renderKey, "GET", `/services?name=${WEB},${WORKER}&limit=20`);
    const web = items.find((i) => i.service.name === WEB)?.service;
    const worker = items.find((i) => i.service.name === WORKER)?.service;
    if (!web) throw new Error(`Render service "${WEB}" not found: create the Blueprint from render.yaml first (docs/demo-hosting.md)`);
    renderWeb = { id: web.id, url: web.serviceDetails?.url };
    renderWorker = worker ? { id: worker.id } : undefined;
  }
  const origin = (opt("DEMO_APP_ORIGIN") ?? renderWeb?.url)?.replace(/\/$/u, "");
  if (!origin) throw new Error("Set DEMO_APP_ORIGIN or RENDER_API_KEY (origin is taken from the Render web service)");

  const project = await supabaseProject(token, dbPassword);
  const ref = project.ref;
  const url = `https://${ref}.supabase.co`;

  step("Миграции");
  const cliEnv = { SUPABASE_ACCESS_TOKEN: token, SUPABASE_DB_PASSWORD: dbPassword };
  cli(["link", "--project-ref", ref], cliEnv);
  cli(["db", "push", "--linked", "--yes"], cliEnv);

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

  type Key = { api_key: string | null; type: string | null; name: string };
  const keys = await api<Key[]>(SB, token, "GET", `/projects/${ref}/api-keys?reveal=true`);
  const publishable = keys.find((k) => k.type === "publishable")?.api_key;
  const secret = keys.find((k) => k.type === "secret")?.api_key;
  if (!publishable || !secret) throw new Error("Project has no publishable/secret API keys: create them in Supabase → Settings → API Keys");

  const appEnv: Record<string, string> = {
    APP_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    SUPABASE_SECRET_KEY: secret,
  };
  for (const name of ["OPENAI_API_KEY", "OPENAI_TUTOR_MODEL", "OPENAI_ASSESSOR_MODEL", "OPENAI_WORKER_MODEL", "OPENAI_EMBEDDING_MODEL"]) {
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

  if (renderKey && renderWeb) {
    step("Переменные окружения Render и деплой");
    const put = (id: string, key: string, value: string) =>
      api(RENDER, renderKey, "PUT", `/services/${id}/env-vars/${key}`, { value });
    for (const [k, v] of Object.entries(appEnv)) await put(renderWeb.id, k, v);
    if (renderWorker) {
      for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "OPENAI_WORKER_MODEL", "OPENAI_EMBEDDING_MODEL"]) {
        if (appEnv[k]) await put(renderWorker.id, k, appEnv[k]);
      }
      await api(RENDER, renderKey, "POST", `/services/${renderWorker.id}/deploys`, {});
    }
    // NEXT_PUBLIC_* are inlined at build time, so the web service must rebuild after they change.
    await api(RENDER, renderKey, "POST", `/services/${renderWeb.id}/deploys`, { clearCache: "clear" });
  }

  const creds = JSON.parse(readFileSync(CREDS, "utf8")) as { password: string; accounts: Record<string, string>; superadmin_totp_secret: string };
  const card = [
    "MSchool — демо в интернете (синтетические данные)",
    `Адрес:         ${origin}`,
    `Пароль (все):  ${creds.password}`,
    `Сотрудник:     ${creds.accounts.emp_a_junior1}`,
    `HR (A / B):    ${creds.accounts.hr_a} / ${creds.accounts.hr_b}`,
    `Суперадмин:    ${creds.accounts.superadmin}  — TOTP-секрет: ${creds.superadmin_totp_secret}`,
    `Supabase:      ${ref}`,
  ].join("\n");
  writeFileSync(".secrets/hosted-demo-access.txt", `${card}\n`, { mode: 0o600 });
  console.log(`\n${card}\n\n(сохранено в .secrets/hosted-demo-access.txt; сборка на Render занимает ~5–10 минут)`);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
