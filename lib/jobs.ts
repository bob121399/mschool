// Safe, user-facing next step for a job state (no internals leaked).
export function jobNextAction(status: string, errorCode: string | null): string {
  if (status === "queued") return "Задача в очереди. Страницу можно закрыть и вернуться позже.";
  if (status === "running") return "Задача выполняется.";
  if (status === "needs_review") return "Результат готов и ждет проверки HR.";
  if (status === "succeeded") return "Готово.";
  switch (errorCode) {
    case "AI_NOT_CONFIGURED": return "ИИ-провайдер не настроен владельцем окружения. Обратитесь к администратору платформы.";
    case "SCANNER_UNAVAILABLE": return "Антивирусная проверка недоступна: файл не обработан. Обратитесь к администратору платформы.";
    case "SCAN_TEXT_LAYER_MISSING": return "В PDF нет текстового слоя. Загрузите PDF с текстом или используйте OCR.";
    case "PDF_ENCRYPTED": return "PDF защищен паролем. Загрузите файл без пароля.";
    case "PDF_CORRUPTED": return "Файл поврежден. Загрузите исправный файл.";
    case "LIMIT_PAGES": return "Больше 300 страниц. Разделите документ.";
    case "LIMIT_CHARS": return "Больше 1 000 000 символов. Разделите документ.";
    case "MALWARE_FOUND": return "Файл заблокирован антивирусом.";
    case "TENANT_INACTIVE":
    case "ACTOR_INACTIVE": return "Задача остановлена: доступ компании или инициатора приостановлен.";
    default: return "Задача завершилась ошибкой. Можно запустить ее повторно.";
  }
}
