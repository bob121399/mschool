import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireEmployee } from "@/lib/auth/guard";
import { loadAssignments, loadRoadmap, type RoadmapItem } from "@/lib/learning/data";
import { PageHeader } from "@/components/shell/app-shell";
import { LessonCard } from "@/components/learning/lesson-card";
import { ProgressBar } from "@/components/ui/progress-bar";

export const metadata: Metadata = { title: "Маршрут трека" };

export default async function RoadmapPage({ params }: PageProps<"/learn/assignments/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireEmployee();
  const roadmap = await loadRoadmap(ctx.db, id);
  if (!roadmap) notFound();
  const assignment = (await loadAssignments(ctx.db, ctx.userId)).find((a) => a.id === id);
  const groups = new Map<string, { title: string; course: string; items: RoadmapItem[] }>();
  for (const item of roadmap) {
    const g = groups.get(item.module_id) ?? { title: item.module_title, course: item.course_title, items: [] };
    g.items.push(item);
    groups.set(item.module_id, g);
  }
  let n = 0;
  return (
    <>
      <PageHeader title={assignment?.track?.title ?? "Маршрут"} description="Порядок фиксирован: следующий урок открывается после прохождения текущего." />
      <div className="mb-6 max-w-xl"><ProgressBar completed={roadmap.filter((r) => r.status === "completed").length} total={roadmap.length} label="Пройдено уроков" /></div>
      <div className="space-y-8">
        {[...groups.entries()].map(([moduleId, g]) => (
          <section key={moduleId} aria-labelledby={`m-${moduleId}`}>
            <h2 id={`m-${moduleId}`} className="mb-3 text-lg font-semibold">{g.title}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{g.course}</span></h2>
            <ol className="space-y-2">
              {g.items.map((item) => {
                n += 1;
                return (
                  <li key={item.lesson_id}>
                    <LessonCard href={`/learn/assignments/${id}/lessons/${item.lesson_id}`} title={item.lesson_title} index={n}
                      status={item.status} score={item.score} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
