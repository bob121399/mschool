export const GRADES = ["junior", "middle", "senior", "head"] as const;
export type Grade = (typeof GRADES)[number];

const gradeNames: Record<Grade, string> = { junior: "Junior", middle: "Middle", senior: "Senior", head: "Head" };
export function gradeLabel(grade: Grade): string {
  return gradeNames[grade];
}
export const gradeOptions = GRADES.map((g) => ({ value: g, label: gradeNames[g] }));

export const roleLabels = { superadmin: "Суперадминистратор", hr_admin: "HR-администратор", employee: "Сотрудник" } as const;

export const documentStatusLabels: Record<string, string> = {
  uploaded: "Загружен", processing: "Обработка", review: "Ожидает проверки HR", approved: "Подтвержден",
  failed: "Ошибка", needs_review: "Требует ручной проверки",
};
export const jobStatusLabels: Record<string, string> = {
  queued: "В очереди", running: "Выполняется", needs_review: "Ожидает проверки HR", succeeded: "Готово", failed: "Ошибка",
};
export const tenantStatusLabels: Record<string, string> = {
  trial: "Пробный период", active: "Активен", suspended: "Приостановлен", archived: "В архиве",
};
export const invoiceStatusLabels: Record<string, string> = {
  draft: "Черновик", issued: "Выставлен", paid: "Оплачен", void: "Аннулирован",
};

export function formatDate(value: string | null | undefined, timeZone = "Asia/Tashkent"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone }).format(new Date(value));
}
export function formatDateTime(value: string | null | undefined, timeZone = "Asia/Tashkent"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}
/** Money in minor units with explicit currency; currencies are never summed together. */
export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "Нет данных";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}
