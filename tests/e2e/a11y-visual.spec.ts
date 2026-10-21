import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, loginSuperadmin } from "./helpers";

const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 390, h: 844 }] as const;
const THEMES = ["light", "dark"] as const;

async function check(page: Page, name: string) {
  for (const theme of THEMES) {
    await page.evaluate((t) => { localStorage.setItem("mschool-theme", t); }, theme);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme, "u"));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `${name} ${theme} ${vp.w}`).toEqual([]);
      await page.screenshot({ path: `docs/screenshots/${name}-${theme}-${vp.w}.png`, fullPage: false });
    }
  }
}

test("primary color is #20CC6D with dark foreground", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("link", { name: "Войти" });
  const [bg, fg] = await btn.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  expect(bg).toBe("rgb(32, 204, 109)");
  const lum = fg.match(/\d+/gu)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
  expect(lum).toBeLessThan(150);
});

test("a11y + screenshots: login", async ({ page }) => { await page.goto("/login"); await check(page, "login"); });
test("a11y + screenshots: employee roadmap and player", async ({ page }) => {
  await login(page, "emp_b_junior1");
  await page.goto("/learn");
  await check(page, "learn-home");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await page.waitForURL(/\/lessons\//u);
  await check(page, "learn-player");
});
test("a11y + screenshots: HR employees and editor", async ({ page }) => {
  await login(page, "hr_b");
  await page.goto("/hr/employees");
  await check(page, "hr-employees");
  await page.goto("/hr");
  await check(page, "hr-home");
});
test("a11y + screenshots: superadmin", async ({ page }) => {
  await loginSuperadmin(page);
  await page.goto("/superadmin?month=2026-09&demo=1");
  await check(page, "superadmin-home");
});
