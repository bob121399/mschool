import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireHr } from "@/lib/auth/guard";
import { loadCourseForEditor } from "@/lib/courses/load";
import { PageHeader } from "@/components/shell/app-shell";
import { CourseEditor } from "@/components/courses/course-editor";
import type { Grade } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Редактор курса" };

export default async function CourseEditPage({ params }: PageProps<"/hr/courses/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireHr();
  const loaded = await loadCourseForEditor(ctx.db, id);
  if (!loaded) notFound();
  const chunks = await ctx.db.from("document_chunks").select("id,page,content,documents!inner(title,status)")
    .eq("tenant_id", ctx.tenantId).eq("documents.status", "approved").order("document_id").order("chunk_index").limit(500);
  const c = loaded.course;
  return (
    <>
      <PageHeader title={c.title} description={c.supersedes_id ? "Новая версия опубликованного курса" : undefined} />
      <p className="mb-4 text-sm"><Link className="underline" href="/hr/courses">← Все курсы</Link></p>
      <CourseEditor key={`${c.id}:${c.revision}`}
        course={{ id: c.id, title: c.title, description: c.description, target_grade: c.target_grade as Grade, version: c.version,
          status: c.status, revision: c.revision, objectives: (c.objectives as string[]) ?? [], coverage_gaps: (c.coverage_gaps as string[]) ?? [] }}
        initialModules={loaded.modules}
        chunks={(chunks.data ?? []).map((x) => ({ id: x.id, page: x.page, document: (x.documents as { title: string }).title,
          preview: x.content.slice(0, 160) }))} />
    </>
  );
}
