import { expect, test } from "@playwright/test";
import { login, logout, noHorizontalOverflow } from "./helpers";

test("roadmap shows a fixed order with locked reasons; reading completion unlocks the next lesson", async ({ page }) => {
  await login(page, "emp_a_junior3");
  await page.getByRole("link", { name: "Весь маршрут" }).click();
  await expect(page.getByText("Откроется после прохождения предыдущего урока").first()).toBeVisible();
  const locked = await page.locator('[aria-disabled="true"]').count();
  expect(locked).toBeGreaterThanOrEqual(2);
  await page.getByRole("link", { name: /Знакомство с регламентом кассы/u }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Знакомство с регламентом кассы" })).toBeVisible();
  await expect(page.getByText(/версия 1 · утверждено HR/u)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Подтвержденные источники" })).toBeVisible();
  const done = page.getByText("Чтение завершено.");
  if (!(await done.isVisible())) {
    await page.getByRole("button", { name: "Завершить чтение" }).click();
    await expect(done).toBeVisible();
  }
  await page.goto("/learn");
  await expect(page.getByRole("link", { name: /Продолжить: Проверка документа клиента/u })).toBeVisible();
});

test("assessed lesson: practice check works; AI not configured → technical error, no score, no completion", async ({ page }) => {
  await login(page, "emp_a_junior3");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await expect(page.getByRole("heading", { name: "Итоговое задание урока" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Завершить чтение" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Проверка документа" }).check();
  await page.getByRole("button", { name: "Проверить" }).first().click();
  await expect(page.getByText(/Верно\./u)).toBeVisible();
  await page.getByLabel("Ваш ответ").fill("Проверю документ клиента и объясню следующий шаг.");
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page.getByText("Проверка не выполнена")).toBeVisible();
  await expect(page.getByText(/ИИ-провайдер не настроен/u).first()).toBeVisible();
  await expect(page.getByText("Задание пройдено")).toHaveCount(0);
});

test("seeded states: passed, failed with appeal, provider error visible in history", async ({ page }) => {
  await login(page, "emp_a_junior2");
  await page.goto("/learn/history");
  await expect(page.getByText(/Нужна доработка · 80/u)).toBeVisible();
  await expect(page.getByText("На рассмотрении")).toBeVisible();
  await logout(page);
  await login(page, "emp_a_middle3");
  await page.goto("/learn/history");
  await expect(page.getByText("Техническая ошибка")).toBeVisible();
});

test("completed track keeps the grade", async ({ page }) => {
  await login(page, "emp_a_middle1");
  await expect(page.getByText(/Учебный стандарт выполнен/u)).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText("Middle");
});

test("mobile 390px: player has no horizontal scroll; tutor in a dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "emp_a_junior1");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Спросить тьютора" }).click();
  await expect(page.getByRole("dialog", { name: "AI-тьютор" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
