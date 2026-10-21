// ru is the complete source dictionary; uz-Latn and en are prepared skeletons that fall back
// to ru key by key (spec «Граница MVP»: интерфейс русский, структура готова для uz-Latn и en).
export const ru = {
  "nav.dashboard": "Обзор",
  "nav.employees": "Сотрудники",
  "nav.courses": "Курсы",
  "nav.tracks": "Треки",
  "nav.knowledge": "Источники",
  "nav.reports": "Отчеты",
  "nav.appeals": "Апелляции",
  "nav.billing": "Оплата",
  "nav.learn": "Мое обучение",
  "nav.history": "История",
  "nav.support": "Поддержка",
  "nav.tenants": "Компании",
  "nav.agents": "Агенты и задачи",
  "nav.analytics": "Аналитика",
  "nav.leads": "Лиды",
  "common.logout": "Выйти",
  "common.demo": "Демонстрационные данные",
  "common.notFound": "Не найдено или недоступно",
  "common.noData": "Нет данных",
} as const;

export type MessageKey = keyof typeof ru;
export type Locale = "ru" | "uz-Latn" | "en";

const uzLatn: Partial<Record<MessageKey, string>> = {
  "nav.learn": "Mening o'qishim",
  "common.logout": "Chiqish",
};
const en: Partial<Record<MessageKey, string>> = {
  "nav.dashboard": "Overview",
  "nav.learn": "My learning",
  "common.logout": "Sign out",
  "common.noData": "No data",
};

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { ru, "uz-Latn": uzLatn, en };

export function t(key: MessageKey, locale: Locale = "ru"): string {
  return dictionaries[locale][key] ?? ru[key];
}
