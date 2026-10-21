import { expect, test } from "@playwright/test";
import { creds, login, loginSuperadmin, logout } from "./helpers";

test("anonymous is redirected to login with a local next", async ({ page }) => {
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/login\?next=%2Flearn/u);
});

test("open redirect is rejected", async ({ page }) => {
  await login(page, "emp_a_junior1", "//evil.example/steal");
  await expect(page).toHaveURL(/localhost:3000\/learn/u);
});

test("employee cannot open HR or superadmin areas", async ({ page }) => {
  await login(page, "emp_a_junior1");
  await expect(page).toHaveURL(/\/learn$/u);
  await page.goto("/hr");
  await expect(page).toHaveURL(/\/forbidden$/u);
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/forbidden$/u);
  const api = await page.request.get("/api/hr/billing");
  expect(api.status()).toBe(403);
});

test("HR lands on /hr; superadmin requires TOTP (MFA)", async ({ page }) => {
  await login(page, "hr_a");
  await expect(page).toHaveURL(/\/hr$/u);
  await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();
  await logout(page);
  await loginSuperadmin(page);
  await expect(page.getByRole("heading", { name: "Показатели платформы" })).toBeVisible();
});

test("suspended employee loses access and is not offered onboarding", async ({ page }) => {
  const { loadEnvFile } = await import("node:process");
  loadEnvFile(".env.local");
  const { serviceClient } = await import("../../scripts/lib/world");
  const admin = serviceClient();
  const email = creds().accounts.emp_a_senior3!;
  await admin.from("users").update({ status: "suspended" }).eq("email", email);
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill(creds().password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/forbidden$/u);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/forbidden$/u);
  } finally {
    await admin.from("users").update({ status: "active" }).eq("email", email);
  }
});

test("SEC-09 logout and login into another tenant shows no previous data", async ({ page }) => {
  await login(page, "emp_a_junior1");
  await expect(page.getByText("Demo Retail A")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("mschool:attempt:x:y", "00000000-0000-4000-8000-000000000000"));
  await logout(page);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await login(page, "emp_b_junior1");
  await expect(page.getByText("Demo Service B")).toBeVisible();
  await expect(page.getByText("Demo Retail A")).toHaveCount(0);
  await expect(page.getByText("Касса")).toHaveCount(0);
});
