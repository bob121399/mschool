import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, MetricCard } from "@/components/ui/card";

export const metadata: Metadata = { title: "Обзор HR" };

export default async function HrHome() {
  const ctx = await requireHr();
  const t = ctx.tenantId;
  const c = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const head = { count: "exact" as const, head: true };
  const [docs, approved, genJobs, drafts, published, tracks, invites, employees, assignments, active, completed, openAppeals, pendingJobs] = await Promise.all([
    c(ctx.db.from("documents").select("id", head).eq("tenant_id", t)),
    c(ctx.db.from("documents").select("id", head).eq("tenant_id", t).eq("status", "approved")),
    c(ctx.db.from("agent_jobs").select("id", head).eq("tenant_id", t).eq("agent_type", "course_creator")),
    c(ctx.db.from("courses").select("id", head).eq("tenant_id", t).eq("status", "draft")),
    c(ctx.db.from("courses").select("id", head).eq("tenant_id", t).eq("status", "published")),
    c(ctx.db.from("tracks").select("id", head).eq("tenant_id", t).eq("status", "published")),
    c(ctx.db.from("invitations").select("id", head).eq("tenant_id", t)),
    c(ctx.db.from("users").select("id", head).eq("tenant_id", t).eq("role", "employee")),
    c(ctx.db.from("assignments").select("id", head).eq("tenant_id", t)),
    c(ctx.db.from("assignments").select("id", head).eq("tenant_id", t).eq("status", "active")),
    c(ctx.db.from("assignments").select("id", head).eq("tenant_id", t).eq("status", "completed")),
    c(ctx.db.from("assessment_appeals").select("id", head).eq("tenant_id", t).eq("status", "open")),
    c(ctx.db.from("agent_jobs").select("id", head).eq("tenant_id", t).in("status", ["queued", "running"])),
  ]);
  const steps = [
    { done: true, label: "Профиль компании создан", href: "/hr" },
    { done: docs > 0, label: "Загрузить источник (PDF/TXT)", href: "/hr/knowledge" },
    { done: approved > 0, label: "Проверить извлеченный текст и подтвердить источник", href: "/hr/knowledge" },
    { done: genJobs > 0 || drafts + published > 0, label: "Запустить методиста или создать черновик", href: "/hr/courses" },
    { done: drafts + published > 0, label: "Проверить черновик курса", href: "/hr/courses" },
    { done: published > 0, label: "Опубликовать курс", href: "/hr/courses" },
    { done: tracks > 0, label: "Собрать и опубликовать трек", href: "/hr/tracks" },
    { done: invites + employees > 0, label: "Пригласить сотрудников", href: "/hr/employees" },
    { done: assignments > 0, label: "Назначить трек", href: "/hr/employees" },
  ];
  const now = new Date().toLocaleDateString("ru-RU");
  return (
    <>
      <PageHeader title="Обзор" description="Показатели считаются по данным вашей компании на момент открытия страницы." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Сотрудники" value={String(employees)} period={`на ${now}`} definition="Активные и приостановленные учетные записи с ролью «Сотрудник»." />
        <MetricCard label="Активные назначения" value={String(active)} period={`на ${now}`} definition="Назначения треков со статусом active." />
        <MetricCard label="Завершенные треки" value={String(completed)} period="за все время" definition="Назначения со статусом completed. Грейд при этом не меняется." />
        <MetricCard label="Открытые апелляции" value={String(openAppeals)} period={`на ${now}`} definition="Апелляции, ожидающие решения HR." />
      </div>
      <Card className="mt-6" title="Первый запуск" description="Чек-лист отражает реальные записи и сохраняется между входами."
        actions={pendingJobs > 0 ? <span className="text-sm text-muted-foreground">Фоновых задач в работе: {pendingJobs}</span> : null}>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i}>
              <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted">
                {s.done ? <CheckCircle2 className="size-5 text-success-text" aria-hidden /> : <Circle className="size-5 text-muted-foreground" aria-hidden />}
                <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
                <span className="sr-only">{s.done ? " — выполнено" : " — не выполнено"}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
