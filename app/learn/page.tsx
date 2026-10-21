import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireEmployee } from "@/lib/auth/guard";
import { loadAssignments, loadRoadmap } from "@/lib/learning/data";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeStepper } from "@/components/ui/grade-stepper";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatDate } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Мое обучение" };

export default async function LearnHome() {
  const ctx = await requireEmployee();
  const assignments = await loadAssignments(ctx.db, ctx.userId);
  const current = assignments.find((a) => a.status === "active") ?? assignments[0];
  const roadmap = current ? await loadRoadmap(ctx.db, current.id) : null;
  const done = roadmap?.filter((r) => r.status === "completed").length ?? 0;
  const next = roadmap?.find((r) => r.status === "in_progress");
  return (
    <>
      <PageHeader title="Мое обучение" description="Фиксированный учебный трек вашего грейда. Повышение грейда — решение HR, не результат курса." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Текущий грейд" className="lg:col-span-1"><GradeStepper current={ctx.grade} /></Card>
        {current && roadmap ? (
          <Card className="lg:col-span-2" title={current.track?.title ?? "Трек"}
            description={`Версия ${current.track?.version ?? "—"} · назначен ${formatDate(current.assigned_at)}${current.due_at ? ` · срок ${formatDate(current.due_at)}` : ""}`}>
            <div className="space-y-4">
              <ProgressBar completed={done} total={roadmap.length} label="Пройдено уроков" />
              {current.status === "completed" ? (
                <p className="flex items-center gap-2 font-medium text-success-text">
                  <CheckCircle2 className="size-5" aria-hidden /> Учебный стандарт выполнен {formatDate(current.completed_at)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {next ? (
                  <Link href={`/learn/assignments/${current.id}/lessons/${next.lesson_id}`}
                    className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-hover">
                    Продолжить: {next.lesson_title}
                  </Link>
                ) : null}
                <Link href={`/learn/assignments/${current.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 hover:bg-muted">
                  Весь маршрут
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <div className="lg:col-span-2">
            <EmptyState title="Назначений пока нет" description="HR назначит учебный трек вашего грейда. Пока можно задать вопрос в поддержку."
              action={<Link href="/support" className="underline">Написать в поддержку</Link>} />
          </div>
        )}
      </div>
    </>
  );
}
