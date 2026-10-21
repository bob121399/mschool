import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { AppealResolve } from "@/components/hr/appeal-resolve";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { formatDateTime } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Апелляции" };

export default async function AppealsPage() {
  const ctx = await requireHr();
  const appeals = await ctx.db.from("assessment_appeals")
    .select("id,status,reason,decision,created_at,user_id,attempt_id,users!assessment_appeals_user_id_tenant_id_fkey(email,full_name),assessment_attempts(answer,result,evaluation,rubric_id,lesson_id,lessons(title,assessment_question))")
    .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(50);
  const rubricIds = (appeals.data ?? []).map((a) => (a.assessment_attempts as { rubric_id: string } | null)?.rubric_id).filter(Boolean) as string[];
  const rubrics = rubricIds.length ? await ctx.db.from("assessment_rubrics").select("id,criteria,passing_score").in("id", rubricIds) : { data: [] };
  return (
    <>
      <PageHeader title="Апелляции" description="Решение принимает человек с обоснованием. Скрытого рейтинга сотрудников нет." />
      {(appeals.data ?? []).length === 0 ? <EmptyState title="Апелляций нет" /> : (
        <ul className="space-y-4">
          {(appeals.data ?? []).map((a) => {
            const at = a.assessment_attempts as { answer: string; result: { passed: boolean; score: number; feedback: string } | null; rubric_id: string;
              lessons: { title: string; assessment_question: string } | null } | null;
            const u = a.users as { email: string; full_name: string } | null;
            const rubric = (rubrics.data ?? []).find((r) => r.id === at?.rubric_id);
            return (
              <li key={a.id} className="space-y-3 rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{at?.lessons?.title ?? "Урок"}</p>
                  <span className="text-sm text-muted-foreground">{u?.full_name || u?.email} · {formatDateTime(a.created_at)}</span>
                  <Badge tone={a.status === "open" ? "warning" : "neutral"}>{a.status === "open" ? "Открыта" : a.status === "upheld" ? "Оценка оставлена" : "Пересмотрена"}</Badge>
                  {a.status === "open" ? <span className="ml-auto"><AppealResolve appealId={a.id} label={at?.lessons?.title ?? "урок"} /></span> : null}
                </div>
                <p className="text-sm"><strong>Причина:</strong> {a.reason}</p>
                <details className="text-sm"><summary className="cursor-pointer">Ответ, рубрика и исходный результат</summary>
                  <div className="mt-2 space-y-2">
                    <p><strong>Задание:</strong> {at?.lessons?.assessment_question}</p>
                    <div className="rounded-lg bg-muted p-3 whitespace-pre-line">{at?.answer}</div>
                    <p><strong>Результат модели:</strong> {at?.result ? `${at.result.passed ? "пройдено" : "не пройдено"}, ${at.result.score}` : "—"}</p>
                    {at?.result ? <SafeMarkdown>{at.result.feedback}</SafeMarkdown> : null}
                    {rubric ? <ul className="list-disc pl-5">{(rubric.criteria as { id: string; description: string; max_points: number; critical: boolean; min_points: number }[])
                      .map((c) => <li key={c.id}>{c.id}: {c.description} — до {c.max_points}{c.critical ? `, обязательно ≥ ${c.min_points}` : ""}</li>)}</ul> : null}
                  </div>
                </details>
                {a.decision ? <p className="text-sm"><strong>Обоснование решения:</strong> {a.decision}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
