import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { TracksClient } from "@/components/hr/tracks-client";
import type { Grade } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Треки" };

export default async function TracksPage() {
  const ctx = await requireHr();
  const [tracks, courses] = await Promise.all([
    ctx.db.from("tracks").select("id,title,version,target_grade,status,revision,track_courses(order_index,courses(title,version))")
      .eq("tenant_id", ctx.tenantId).order("title").order("version", { ascending: false }),
    ctx.db.from("courses").select("id,title,version,target_grade").eq("tenant_id", ctx.tenantId).eq("status", "published").order("title"),
  ]);
  return (
    <>
      <PageHeader title="Учебные треки" description="Для каждого грейда — фиксированный, версионированный трек. Тьютор меняет только глубину объяснения." />
      <TracksClient courses={(courses.data ?? []).map((c) => ({ ...c, target_grade: c.target_grade as Grade }))}
        tracks={(tracks.data ?? []).map((t) => ({ id: t.id, title: t.title, version: t.version, target_grade: t.target_grade as Grade,
          status: t.status, revision: t.revision,
          courses: [...((t.track_courses ?? []) as { order_index: number; courses: { title: string; version: number } | null }[])]
            .sort((a, b) => a.order_index - b.order_index).map((tc) => `${tc.courses?.title ?? "—"} v${tc.courses?.version ?? "?"}`) }))} />
    </>
  );
}
