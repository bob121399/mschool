import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => { await login(page, "hr_a"); await expect(page).toHaveURL(/\/hr$/u); });

test("checklist reflects real entities", async ({ page }) => {
  await expect(page.getByText("Опубликовать курс")).toBeVisible();
  await expect(page.getByText("— выполнено").first()).toBeAttached();
});

test("employees table: server pagination, invite dialog focus trap and Esc", async ({ page }) => {
  await page.goto("/hr/employees");
  await expect(page.getByRole("table", { name: "Сотрудники компании" })).toBeVisible();
  await expect(page.getByText("Всего: 12")).toBeVisible();
  await page.getByPlaceholder("Поиск по email или имени").fill("middle");
  await expect(page).toHaveURL(/q=middle/u);
  await expect(page.getByText("Всего: 3")).toBeVisible();
  await page.getByRole("button", { name: "Пригласить" }).click();
  const dialog = page.getByRole("dialog", { name: "Пригласить сотрудника" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Пригласить" })).toBeFocused();
});

test("knowledge: approved source and scan needing review with a concrete next step", async ({ page }) => {
  await page.goto("/hr/knowledge");
  await expect(page.getByText("Подтвержден").first()).toBeVisible();
  await expect(page.getByText("Требует ручной проверки")).toBeVisible();
  await expect(page.getByText(/нет текстового слоя/u)).toBeVisible();
});

test("draft editor: save with revision guard, publish validation lists rubric sum", async ({ page }) => {
  await page.goto("/hr/courses");
  await page.getByRole("link", { name: /черновик v2/u }).click();
  await expect(page.getByText(/Черновик · v1/u)).toBeVisible();
  await page.getByLabel("Измеримый результат обучения").fill(`Измеримый результат после правки e2e ${Date.now()}`);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Черновик сохранен")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/проходной балл 80; обязательные: C1 ≥ 40/u).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Отмена" }).click();
});

test("published course is read-only and offers a new version", async ({ page }) => {
  await page.goto("/hr/courses");
  await page.getByRole("link", { name: "Касса: стандарт Senior" }).click();
  await expect(page.getByText("Опубликованная версия не редактируется.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeVisible();
  await expect(page.getByLabel("Название урока")).toHaveAttribute("readonly", "");
});

test("appeals, reports, billing, tracks render real data", async ({ page }) => {
  await page.goto("/hr/appeals");
  await expect(page.getByText("Открыта")).toBeVisible();
  await page.goto("/hr/billing");
  await expect(page.getByText("Оплачен")).toBeVisible();
  await page.goto("/hr/tracks");
  await expect(page.getByText("Трек Касса junior")).toBeVisible();
  await page.goto("/hr/reports");
  await expect(page.getByRole("button", { name: "Сформировать отчет" })).toBeVisible();
});
