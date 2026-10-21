// Screenshot tour of key screens (synthetic demo data). Run: TOUR=1 npx playwright test tests/e2e/tour.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { login, loginSuperadmin, logout } from "./helpers";

test.skip(!process.env.TOUR, "screenshot tour runs only on demand (TOUR=1)");
const DIR = process.env.TOUR_DIR ?? "docs/screenshots/tour";
let n = 0;
async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  n += 1;
  await page.screenshot({ path: `${DIR}/${String(n).padStart(2, "0")}-${name}.png`, fullPage: true });
}

test("tour", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await shot(page, "landing");
  await page.goto("/login");
  await shot(page, "login");

  await login(page, "emp_a_junior1");
  await shot(page, "employee-home");
  await page.getByRole("link", { name: "Весь маршрут" }).click();
  await expect(page.getByText(/Пройдено уроков/u)).toBeVisible();
  await shot(page, "employee-roadmap");
  await page.goto("/learn");
  await page.getByRole("link", { name: /Продолжить/u }).click();
  await page.waitForURL(/\/lessons\//u);
  await shot(page, "employee-lesson-player");
  await page.getByLabel("Ваш ответ").fill("Сначала проверю документ клиента, затем объясню клиенту следующий шаг.");
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page.getByText("Проверка не выполнена")).toBeVisible();
  await page.getByRole("heading", { name: "Итоговое задание урока" }).scrollIntoViewIfNeeded();
  await shot(page, "employee-assessment-ai-not-configured");
  await page.goto("/learn/history");
  await shot(page, "employee-history");
  await logout(page);

  await login(page, "hr_a");
  await shot(page, "hr-dashboard");
  await page.goto("/hr/employees");
  await shot(page, "hr-employees");
  await page.goto("/hr/knowledge");
  await shot(page, "hr-knowledge");
  await page.goto("/hr/courses");
  await shot(page, "hr-courses");
  await page.getByRole("link", { name: /черновик v2/u }).click();
  await expect(page.getByText(/Черновик · v1/u)).toBeVisible();
  await shot(page, "hr-course-editor");
  await page.goto("/hr/tracks");
  await shot(page, "hr-tracks");
  await page.goto("/hr/appeals");
  await shot(page, "hr-appeals");
  await page.goto("/hr/billing");
  await shot(page, "hr-billing");
  await logout(page);

  await loginSuperadmin(page);
  await page.goto("/superadmin?month=2026-09&currency=USD&demo=1");
  await shot(page, "superadmin-metrics-with-demo");
  await page.goto("/superadmin/tenants");
  await shot(page, "superadmin-tenants");
  await page.goto("/superadmin/billing");
  await shot(page, "superadmin-billing");
  await page.goto("/superadmin/agents");
  await shot(page, "superadmin-agents");
});
