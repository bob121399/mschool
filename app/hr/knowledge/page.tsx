import Link from "next/link";
import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { databaseError } from "@/lib/http";
import { PageHeader } from "@/components/shell/app-shell";
import { UploadSource } from "@/components/hr/upload-source";
import { ReprocessButton } from "@/components/hr/document-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { documentStatusLabels, formatDateTime } from "@/lib/i18n/labels";
import { jobNextAction } from "@/lib/jobs";

export const metadata: Metadata = { title: "Источники" };

export default async function KnowledgePage() {
  const ctx = await requireHr();
  const docs = await ctx.db.from("documents").select("id,title,original_filename,size_bytes,status,error_code,page_count,created_at")
    .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(100);
  if (docs.error) databaseError(docs.error);
  const rows = docs.data ?? [];
  return (
    <>
      <PageHeader title="Источники знаний" description="Антивирус → извлечение текста → фрагменты → проверка HR → подтвержденный источник. Сканы без текста требуют PDF с текстом или OCR." />
      <UploadSource />
      <div className="mt-6">
        {rows.length === 0 ? <EmptyState title="Источников пока нет" description="Загрузите первый регламент в формате PDF или TXT." /> : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Загруженные источники</caption>
              <thead className="bg-muted text-left"><tr>
                <th scope="col" className="p-3">Источник</th><th scope="col" className="p-3">Статус</th>
                <th scope="col" className="p-3">Страниц</th><th scope="col" className="p-3">Загружен</th><th scope="col" className="p-3">Следующий шаг</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="p-3"><Link href={`/hr/knowledge/${d.id}`} className="font-medium underline-offset-2 hover:underline">{d.title}</Link>
                      <p className="text-xs text-muted-foreground">{d.original_filename} · {(d.size_bytes / 1024).toFixed(0)} КБ</p></td>
                    <td className="p-3"><Badge tone={d.status === "approved" ? "success" : d.status === "failed" ? "danger" : d.status === "needs_review" ? "warning" : "neutral"}>
                      {documentStatusLabels[d.status] ?? d.status}</Badge>{d.error_code ? <p className="mt-1 text-xs text-muted-foreground">{d.error_code}</p> : null}</td>
                    <td className="p-3 tabular-nums">{d.page_count ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(d.created_at)}</td>
                    <td className="p-3 text-xs">
                      {d.status === "review" ? <Link className="underline" href={`/hr/knowledge/${d.id}`}>Проверить текст и подтвердить</Link>
                        : d.status === "approved" ? "Можно использовать в курсах"
                        : d.status === "processing" ? "Идет обработка"
                        : <div className="space-y-2"><p>{jobNextAction("failed", d.error_code)}</p>{d.status === "uploaded" || d.status === "failed" || d.status === "needs_review"
                          ? <ReprocessButton documentId={d.id} /> : null}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
