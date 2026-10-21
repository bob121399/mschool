import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireEmployee } from "@/lib/auth/guard";
import { lessonContextSchema } from "@/lib/auth/context";
import { loadRoadmap } from "@/lib/learning/data";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { ChatPanel } from "@/components/learning/chat-panel";
import { PracticeQuiz } from "@/components/learning/practice-quiz";
import { AssessmentPanel } from "@/components/learning/assessment-panel";
import { ReadingComplete } from "@/components/learning/reading-complete";
import { EngagementTracker } from "@/components/learning/engagement-tracker";
import { MobileTutor } from "@/components/learning/mobile-tutor";

export const metadata: Metadata = { title: "Урок" };
const sourcesSchema = z.array(z.object({ chunk_id: z.string(), document_title: z.string(), page: z.number(), excerpt: z.string() }));

export default async function LessonPlayer({ params }: PageProps<"/learn/assignments/[id]/lessons/[lessonId]">) {
  const { id, lessonId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lessonId).success) notFound();
  const ctx = await requireEmployee();
  const lc = await ctx.db.rpc("lesson_context", { p_assignment: id, p_lesson: lessonId });
  const lesson = lessonContextSchema.safeParse(lc.data);
  if (lc.error || !lesson.success) notFound();
  const l = lesson.data;
  const [roadmap, course, sources, history] = await Promise.all([
    loadRoadmap(ctx.db, id),
    ctx.db.from("courses").select("title,version").eq("id", l.course_id).maybeSingle(),
    ctx.db.rpc("lesson_sources_for_learner", { p_assignment: id, p_lesson: lessonId }),
    ctx.db.from("tutor_exchanges").select("question,answer,citations,created_at").eq("assignment_id", id).eq("lesson_id", lessonId)
      .order("created_at", { ascending: true }).limit(20),
  ]);
  const item = roadmap?.find((r) => r.lesson_id === lessonId);
  const cites = sourcesSchema.safeParse(sources.data).data ?? [];
  const initial = (history.data ?? []).map((h) => ({ question: h.question, answer: h.answer,
    citations: (h.citations as { source_id: string; title: string; page: number | null }[]) ?? [] }));
  const chat = <ChatPanel assignmentId={id} lessonId={lessonId} initial={initial} />;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <EngagementTracker assignmentId={id} lessonId={lessonId} />
      <article className="min-w-0 space-y-6">
        <nav aria-label="Хлебные крошки" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/learn" className="hover:underline">Мое обучение</Link> /</li>
            <li><Link href={`/learn/assignments/${id}`} className="hover:underline">{item?.course_title ?? "Трек"}</Link> /</li>
            <li aria-current="page">{item?.module_title ?? "Модуль"}</li>
          </ol>
        </nav>
        <header>
          <h1 className="text-2xl font-semibold leading-tight">{l.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Курс «{course.data?.title ?? "—"}», версия {course.data?.version ?? "—"} · утверждено HR</p>
        </header>
        <div className="rounded-card border border-border bg-surface p-5"><SafeMarkdown>{l.content}</SafeMarkdown></div>
        {cites.length ? (
          <section aria-labelledby="cites-title" className="space-y-2">
            <h2 id="cites-title" className="text-base font-semibold">Подтвержденные источники</h2>
            <ul className="space-y-2">
              {cites.map((c) => (
                <li key={c.chunk_id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{c.document_title}, стр. {c.page}</p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{c.excerpt}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <PracticeQuiz assignmentId={id} lessonId={lessonId} />
        {l.requires_assessment ? (
          <AssessmentPanel assignmentId={id} lessonId={lessonId} question={l.assessment_question}
            alreadyCompleted={l.progress_status === "completed"} />
        ) : (
          <ReadingComplete assignmentId={id} lessonId={lessonId} completed={l.progress_status === "completed"} />
        )}
        <div className="xl:hidden"><MobileTutor>{chat}</MobileTutor></div>
      </article>
      <aside className="hidden xl:block"><div className="sticky top-20 rounded-card border border-border bg-surface p-4">{chat}</div></aside>
    </div>
  );
}
