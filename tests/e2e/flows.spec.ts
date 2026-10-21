// End-to-end Auth email flows through the LOCAL Mailpit inbox of `supabase start` (no real email).
import { expect, test, type APIRequestContext } from "@playwright/test";
import { login } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function linkFromMail(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = await list.json() as { messages?: { ID: string }[] };
    const id = data.messages?.[0]?.ID;
    if (id) {
      const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json() as { HTML: string };
      const href = /href="([^"]+\/auth\/confirm[^"]+)"/u.exec(msg.HTML)?.[1];
      if (href) return href.replace(/&amp;/gu, "&");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no mail for ${to}`);
}

test("signup → email confirmation → onboarding creates a trial company as HR", async ({ page, request }) => {
  const email = `owner-${Date.now()}@demo.mschool.local`;
  await page.goto("/signup");
  await page.getByLabel("Рабочий email").fill(email);
  await page.getByLabel("Пароль").fill("Demo-password-123");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByText("Проверьте почту")).toBeVisible();
  await page.goto(await linkFromMail(request, email));
  await expect(page).toHaveURL(/\/onboarding$/u);
  await page.getByLabel("Название компании").fill("E2E Пилотная компания");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Создать пробное пространство" }).click();
  await expect(page).toHaveURL(/\/hr$/u);
  await expect(page.getByText("E2E Пилотная компания")).toBeVisible();
});

test("HR invitation → email link → accept → employee workspace; role and tenant come from the invitation", async ({ page, request }) => {
  const email = `invitee-${Date.now()}@demo.mschool.local`;
  await login(page, "hr_a");
  await page.goto("/hr/employees");
  await page.getByRole("button", { name: "Пригласить" }).click();
  const dialog = page.getByRole("dialog", { name: "Пригласить сотрудника" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Грейд").selectOption("senior");
  await dialog.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Приглашение отправлено")).toBeVisible();
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/login/u);
  await page.goto(await linkFromMail(request, email));
  await expect(page).toHaveURL(/\/invite\/accept\?token=[0-9a-f]{64}$/u);
  await page.getByLabel("Имя и фамилия").fill("Приглашенный Сотрудник");
  await page.getByLabel("Пароль").fill("Demo-password-456");
  await page.getByRole("button", { name: "Принять приглашение" }).click();
  await expect(page).toHaveURL(/\/learn$/u);
  await expect(page.getByText("Demo Retail A")).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText("Senior");
  await expect(page.getByText("Назначений пока нет")).toBeVisible();
});
