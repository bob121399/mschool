// Product Analyst allowlist (spec 3.4). Definitions are shown to superadmin via "показать расчет".
export const ANALYTICS_TEMPLATES: Record<string, { title: string; definition: string }> = {
  course_funnel: { title: "Воронка курса", definition: "Назначения периода → с хотя бы одним серверным событием после назначения → завершенные. Demo исключены." },
  cohort_completion: { title: "Завершение по недельным cohort", definition: "Cohort = неделя назначения (UTC). completion_pct = completed / assigned на момент запроса (не D7). Группы < 5 скрыты." },
  time_to_first_lesson: { title: "Время до первого урока", definition: "Медиана часов от назначения до первого серверного события сотрудника. Demo исключены." },
  ai_cost_per_completed_lesson: { title: "AI-затраты на завершенный урок", definition: "Сумма input/output tokens из журнала агентов и число завершенных уроков; стоимость считается по датированным ставкам, неизвестная ставка ≠ 0." },
  trial_to_paid: { title: "Trial → оплата", definition: "Компании, созданные в периоде, и доля с хотя бы одним оплаченным счетом. Pipeline и trial не являются MRR." },
  active_seat_expansion: { title: "Рост активных мест", definition: "Сумма active_seats выставленных/оплаченных счетов по месяцам и валютам; группы < 5 компаний скрыты." },
};
