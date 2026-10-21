import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { totp } from "../support/totp";

type Creds = { password: string; superadmin_totp_secret: string; accounts: Record<string, string> };
export function creds(): Creds {
  return JSON.parse(readFileSync(".secrets/seed-credentials.json", "utf8")) as Creds;
}

export async function login(page: Page, account: string, next?: string) {
  const c = creds();
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(c.accounts[account]!);
  await page.getByLabel("Пароль").fill(c.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

export async function loginSuperadmin(page: Page) {
  await login(page, "superadmin");
  await expect(page).toHaveURL(/\/mfa$/u);
  // Avoid a code from a window that just closed.
  const now = Date.now();
  if (now % 30_000 > 27_000) await page.waitForTimeout(30_000 - (now % 30_000) + 200);
  await page.getByLabel("Код подтверждения").fill(totp(creds().superadmin_totp_secret));
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page).toHaveURL(/\/superadmin$/u);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/login/u);
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
