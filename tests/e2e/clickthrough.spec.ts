// Captures a clickable snapshot of the running app: every screen reachable by links per role, with
// the positions of its links. Run on demand: CLICKTHROUGH=1 npx playwright test tests/e2e/clickthrough.spec.ts
// Output (synthetic seed data only): $CLICKTHROUGH_DIR/{screens.json, *.jpg}.
import { mkdirSync, writeFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { login, loginSuperadmin, logout } from "./helpers";

test.skip(!process.env.CLICKTHROUGH, "clickthrough capture runs only on demand (CLICKTHROUGH=1)");
const DIR = process.env.CLICKTHROUGH_DIR ?? "test-results/clickthrough";
const PER_ROLE = 18;
const PER_PATTERN = 2;

type Link = { href: string; text: string; x: number; y: number; w: number; h: number };
type Screen = { key: string; role: string; title: string; image: string; width: number; height: number; links: Link[] };
const screens: Screen[] = [];

const keyOf = (url: URL) => `${url.pathname}${url.search}`;
const patternOf = (path: string) => path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gu, ":id");

async function capture(page: Page, role: string): Promise<Link[]> {
  await page.waitForLoadState("networkidle");
  const url = new URL(page.url());
  const image = `${role}-${String(screens.length + 1).padStart(2, "0")}.jpg`;
  await page.screenshot({ path: `${DIR}/${image}`, fullPage: true, type: "jpeg", quality: 72 });
  const data = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim() || document.title,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => {
      const r = a.getBoundingClientRect();
      return { href: a.href, text: (a.textContent ?? "").trim().slice(0, 80), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    }).filter((l) => l.w > 2 && l.h > 2),
  }));
  const links = data.links.filter((l) => new URL(l.href).origin === url.origin);
  screens.push({ key: keyOf(url), role, title: data.title, image, width: data.width, height: data.height, links });
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
  mkdirSync(DIR, { recursive: true });
  await page.goto("/");
  await capture(page, "public");
  await page.goto("/login");
  await capture(page, "public");

  await login(page, "emp_a_junior1");
  await crawl(page, "employee", "/learn", /^\/learn(\/|$)/u);
  await logout(page);

  await login(page, "hr_a");
  await crawl(page, "hr", "/hr", /^\/hr(\/|$)/u);
  await logout(page);

  await loginSuperadmin(page);
  await crawl(page, "superadmin", "/superadmin?month=2026-09&currency=USD&demo=1", /^\/superadmin(\/|$)/u);

  writeFileSync(`${DIR}/screens.json`, JSON.stringify(screens, null, 1));
});
