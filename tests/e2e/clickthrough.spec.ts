// Captures a clickable snapshot of the running app: every screen reachable by links per role, with
// the positions of its links, plus scripted interaction states for the pitch walkthrough. Run on demand: CLICKTHROUGH=1 npx playwright test tests/e2e/clickthrough.spec.ts
// Output (synthetic seed data only): $CLICKTHROUGH_DIR/{screens.json, *.jpg}.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { creds, login, logout } from "./helpers";
import { totp } from "../support/totp";

test.skip(!process.env.CLICKTHROUGH, "clickthrough capture runs only on demand (CLICKTHROUGH=1)");
const DIR = process.env.CLICKTHROUGH_DIR ?? "test-results/clickthrough";
const PER_ROLE = 18;
const PER_PATTERN = 2;

type Link = { href: string; text: string; x: number; y: number; w: number; h: number };
type Screen = { key: string; role: string; title: string; image: string; width: number; height: number; links: Link[]; state?: string; mobile?: boolean };
const screens: Screen[] = [];

const keyOf = (url: URL) => `${url.pathname}${url.search}`;
const patternOf = (path: string) => path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gu, ":id");

async function capture(page: Page, role: string, state?: string, full = true): Promise<Link[]> {
  await page.waitForLoadState("networkidle");
  // Full-page shots are taken from the top; otherwise sticky chrome is painted mid-page.
  if (full) await page.evaluate(() => scrollTo(0, 0));
  const url = new URL(page.url());
  const image = `${state ?? `${role}-${String(screens.length + 1).padStart(2, "0")}`}.jpg`;
  await page.screenshot({ path: `${DIR}/${image}`, fullPage: full, type: "jpeg", quality: 72 });
  const data = await page.evaluate((full) => ({
    title: document.querySelector("h1")?.textContent?.trim() || document.title,
    width: document.documentElement.scrollWidth,
    height: full ? document.documentElement.scrollHeight : innerHeight,
    links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => {
      const r = a.getBoundingClientRect();
      return { href: a.href, text: (a.textContent ?? "").trim().slice(0, 80), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    }).filter((l) => l.w > 2 && l.h > 2 && (full || (l.y >= 0 && l.y < innerHeight))),
  }), full);
  const links = data.links.filter((l) => new URL(l.href).origin === url.origin);
  const mobile = (page.viewportSize()?.width ?? 1440) < 600;
  screens.push({ key: keyOf(url), role, title: data.title, image, width: data.width, height: data.height, links, state, mobile });
  return links;
}

async function crawl(page: Page, role: string, start: string, area: RegExp) {
  const seen = new Set<string>();
  const patterns = new Map<string, number>();
  const queue: { path: string; depth: number }[] = [{ path: start, depth: 0 }];
  let count = 0;
  while (queue.length && count < PER_ROLE) {
    const { path, depth } = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    await page.goto(path);
    const landed = keyOf(new URL(page.url()));
    if (landed !== path && seen.has(landed)) continue;
    seen.add(landed);
    count += 1;
    const links = await capture(page, role);
    if (depth >= 3) continue;
    for (const l of links) {
      const u = new URL(l.href);
      const key = keyOf(u);
      if (!area.test(u.pathname) || seen.has(key) || queue.some((q) => q.path === key)) continue;
      const p = patternOf(u.pathname);
      if ((patterns.get(p) ?? 0) >= PER_PATTERN) continue;
      patterns.set(p, (patterns.get(p) ?? 0) + 1);
      queue.push({ path: key, depth: depth + 1 });
    }
  }
}

test("clickthrough", async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(20_000);
  mkdirSync(DIR, { recursive: true });
  await page.goto("/");
  await capture(page, "public");
  await page.goto("/login");
  await capture(page, "public");

  await login(page, "emp_a_junior1");
  await crawl(page, "employee", "/learn", /^\/learn(\/|$)/u);
  // Scripted states: self-check answered; final task without an AI key (honest error, no score).
  await page.goto("/learn");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await page.waitForURL(/\/lessons\//u);
  const done = page.getByRole("button", { name: "Завершить чтение" });
  if (await done.count()) await done.click();
  await page.goto("/learn");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await page.waitForURL(/\/lessons\//u);
  await page.waitForLoadState("networkidle");
  const right = page.getByRole("radio", { name: "Проверка документа" });
  const answer = (await right.count()) ? right : page.getByRole("radio").first();
  await expect(async () => {
    await answer.check();
    await expect(page.getByRole("button", { name: "Проверить" }).first()).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Проверить" }).first().click();
  await expect(page.getByText(/Верно\.|Неверно/u).first()).toBeVisible();
  await capture(page, "employee", "state-selfcheck");
  await page.getByLabel("Ваш ответ").fill("Сначала проверю документ клиента, затем объясню клиенту следующий шаг.");
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page.getByText("Проверка не выполнена")).toBeVisible();
  await capture(page, "employee", "state-assessment-no-ai");
  await logout(page);
  await login(page, "emp_a_junior2");
  await page.goto("/learn/history");
  await capture(page, "employee", "state-history-appeal");
  await logout(page);
  await login(page, "emp_a_middle1");
  await capture(page, "employee", "state-track-completed");
  await logout(page);

  await login(page, "hr_a");
  await crawl(page, "hr", "/hr", /^\/hr(\/|$)/u);
  await page.goto("/hr/employees");
  await page.getByRole("button", { name: "Пригласить" }).click();
  await expect(page.getByRole("dialog", { name: "Пригласить сотрудника" })).toBeVisible();
  await capture(page, "hr", "state-hr-invite", false);
  await page.keyboard.press("Escape");
  await logout(page);
  await login(page, "hr_b");
  await capture(page, "hr", "state-hr-tenant-b");
  await logout(page);

  await login(page, "superadmin");
  await expect(page).toHaveURL(/\/mfa$/u);
  await capture(page, "superadmin", "state-mfa");
  if (Date.now() % 30_000 > 27_000) await page.waitForTimeout(3_500);
  await page.getByLabel("Код подтверждения").fill(totp(creds().superadmin_totp_secret));
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page).toHaveURL(/\/superadmin$/u);
  await crawl(page, "superadmin", "/superadmin?month=2026-09&currency=USD&demo=1", /^\/superadmin(\/|$)/u);
  await page.goto("/superadmin/tenants");
  await page.getByRole("link", { name: "Demo Retail A" }).click();
  await page.getByLabel(/Основание просмотра/u).fill("Подготовка к пилоту: проверка настроек компании");
  await page.getByRole("button", { name: "Открыть данные компании" }).click();
  await expect(page.getByText(/Вы просматриваете данные компании/u)).toBeVisible();
  await capture(page, "superadmin", "state-sa-tenant-reason");
  await logout(page);

  // Phone layout (390 px): home and lesson player.
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "emp_a_junior3");
  await capture(page, "employee", "state-mobile-home");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await page.waitForURL(/\/lessons\//u);
  await capture(page, "employee", "state-mobile-lesson");

  writeFileSync(`${DIR}/screens.json`, JSON.stringify(screens, null, 1));
});
