import type { Metadata } from "next";
import { requireEmployee } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "История" };

export default async function HistoryPage() {
  const ctx = await requireEmployee();
  const [attempts, appeals, overrides] = await Promise.all([
    ctx.db.from("assessment_attempts").select("id,lesson_id,status,result,error_code,created_at,lessons(title)")
      .eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(50),
    ctx.db.from("assessment_appeals").select("attempt_id,status,decision,created_at").eq("user_id", ctx.userId),
    ctx.db.from("assessment_overrides").select("attempt_id,passed,score,reason"),
  ]);
  const appealBy = new Map((appeals.data ?? []).map((a) => [a.attempt_id, a]));
  const overrideBy = new Map((overrides.data ?? []).map((o) => [o.attempt_id, o]));
  const rows = attempts.data ?? [];
  return (
    <>
      <PageHeader title="История попыток" description="Технические ошибки проверки не являются оценкой ответа." />
      {rows.length === 0 ? <EmptyState title="Попыток пока нет" description="Откройте урок с итоговым заданием и отправьте ответ." /> : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left"><tr>
              <th scope="col" className="p-3">Урок</th><th scope="col" className="p-3">Когда</th>
              <th scope="col" className="p-3">Итог</th><th scope="col" className="p-3">Апелляция</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const result = a.result as { passed: boolean; score: number } | null;
                const appeal = appealBy.get(a.id);
                const override = overrideBy.get(a.id);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-3">{(a.lessons as { title: string } | null)?.title ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                    <td className="p-3">
                      {a.status === "succeeded" && result ? (
                        <Badge tone={result.passed ? "success" : "warning"}>{result.passed ? "Пройдено" : "Нужна доработка"} · {result.score}</Badge>
                      ) : a.status === "failed" ? <Badge tone="danger">Техническая ошибка</Badge> : <Badge>Проверяется</Badge>}
                      {override ? <span className="ml-2 text-xs">Решение HR: {override.passed ? "засчитано" : "не засчитано"} ({override.score})</span> : null}
                    </td>
                    <td className="p-3">{appeal ? `${appeal.status === "open" ? "На рассмотрении" : appeal.status === "upheld" ? "Оценка оставлена" : "Пересмотрено"}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
