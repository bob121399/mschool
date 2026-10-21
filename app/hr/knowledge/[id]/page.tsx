import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { ApproveSource } from "@/components/hr/document-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { documentStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Проверка источника" };

export default async function SourcePage({ params }: PageProps<"/hr/knowledge/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireHr();
  const doc = await ctx.db.from("documents").select("id,title,status,page_count,char_count,error_code,original_filename").eq("id", id).maybeSingle();
  if (!doc.data) notFound();
  const chunks = await ctx.db.from("document_chunks").select("id,chunk_index,page,content,embedding_model").eq("document_id", id)
    .order("chunk_index").limit(200);
  return (
    <>
      <PageHeader title={doc.data.title} description={`${doc.data.original_filename} · страниц: ${doc.data.page_count ?? "—"} · символов: ${doc.data.char_count ?? "—"}`}
        actions={doc.data.status === "review" ? <ApproveSource documentId={id} title={doc.data.title} /> : <Badge>{documentStatusLabels[doc.data.status]}</Badge>} />
      <p className="mb-4 text-sm"><Link href="/hr/knowledge" className="underline">← Все источники</Link></p>
      {doc.data.status === "review" ? <div className="mb-4"><Alert kind="info">Сверьте извлеченный текст с оригиналом: таблицы, номера пунктов, исключения. Подтверждение необратимо для этой версии.</Alert></div> : null}
      {(chunks.data ?? []).length === 0 ? <Alert kind="warning">Фрагментов нет. {doc.data.error_code ? `Код: ${doc.data.error_code}.` : ""}</Alert> : (
        <ol className="space-y-3">
          {(chunks.data ?? []).map((c) => (
            <li key={c.id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <p className="mb-2 text-xs text-muted-foreground">Фрагмент {c.chunk_index + 1} · стр. {c.page} · {c.embedding_model}</p>
              <p className="whitespace-pre-line">{c.content}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
