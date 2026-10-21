import { expect, test } from "@playwright/test";
import { loginSuperadmin } from "./helpers";

test("platform metrics exclude demo by default and require an explicit toggle", async ({ page }) => {
  await loginSuperadmin(page);
  await page.goto("/superadmin?month=2026-09&currency=USD");
  await expect(page.getByText("Нет данных").first()).toBeVisible();
  await page.goto("/superadmin?month=2026-09&currency=USD&demo=1");
  await expect(page.getByText("Включены демонстрационные компании")).toBeVisible();
  await expect(page.getByText(/\$/u).first()).toBeVisible();
});

test("tenant details require a reason and show a viewing banner", async ({ page }) => {
  await loginSuperadmin(page);
  await page.goto("/superadmin/tenants");
  await page.getByRole("link", { name: "Demo Retail A" }).click();
  await expect(page.getByLabel(/Основание просмотра/u)).toBeVisible();
  await page.getByLabel(/Основание просмотра/u).fill("Проверка e2e: аудит просмотра");
  await page.getByRole("button", { name: "Открыть данные компании" }).click();
  await expect(page.getByText(/Вы просматриваете данные компании «Demo Retail A»/u)).toBeVisible();
  await expect(page.getByText("view_tenant").first()).toBeVisible();
});

test("billing page lists invoices with human payment confirmation", async ({ page }) => {
  await loginSuperadmin(page);
  await page.goto("/superadmin/billing");
  await expect(page.getByRole("button", { name: "Подтвердить оплату" }).first()).toBeVisible();
});
