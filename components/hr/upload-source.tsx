"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { browserDb } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

const MAX = 20 * 1024 * 1024;

/** Upload progress is separate from parsing/generation; the durable job survives leaving the page. */
export function UploadSource() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<"idle" | "hashing" | "uploading" | "verifying" | "queued">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!file) return;
    setError(null);
    const mime = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain";
    if (file.size > MAX) { setError("Файл больше 20 МБ."); return; }
    setStage("hashing");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const meta = await apiFetch<{ documentId: string; uploadPath: string }>("/api/hr/documents", { method: "POST",
      body: { title: title || file.name, filename: file.name, mime, size: file.size, sha256: digest } });
    if (!meta.ok) { setError(errorMessage(meta.error)); setStage("idle"); return; }
    setStage("uploading");
    const up = await browserDb().storage.from("knowledge").upload(meta.data.uploadPath, bytes, { contentType: mime, upsert: false });
    if (up.error) {
      await apiFetch(`/api/hr/documents/${meta.data.documentId}/upload-failed`, { method: "POST", body: {} });
      setError("Загрузка не удалась. Запись документа помечена как ошибочная.");
      setStage("idle");
      router.refresh();
      return;
    }
    setStage("verifying");
    const proc = await apiFetch(`/api/hr/documents/${meta.data.documentId}/process`, { method: "POST", body: {} });
    if (!proc.ok) setError(`Файл загружен, но обработка не запущена: ${errorMessage(proc.error)}`);
    setStage(proc.ok ? "queued" : "idle");
    setFile(null);
    setTitle("");
    router.refresh();
  }
  const busy = stage !== "idle" && stage !== "queued";
  return (
    <div className="space-y-3 rounded-card border border-dashed border-border bg-surface p-5">
      <p className="flex items-center gap-2 font-medium"><UploadCloud className="size-5" aria-hidden /> Загрузить регламент (PDF с текстом или TXT, до 20 МБ, до 300 страниц)</p>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {stage === "queued" ? <Alert kind="success">Файл загружен, обработка поставлена в очередь. Страницу можно закрыть.</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Файл
          <input type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={busy}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setStage("idle"); }} className="min-h-11 text-sm" />
        </label>
        <TextField label="Название источника" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={busy}
          helper="Имя файла хранится как текст и не используется в пути хранения." />
      </div>
      {file ? <p className="text-sm text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} КБ</p> : null}
      <Button onClick={() => void submit()} loading={busy} disabled={!file}
        loadingText={stage === "hashing" ? "Считаем контрольную сумму…" : stage === "uploading" ? "Загружаем…" : "Проверяем файл…"}>
        Загрузить и обработать
      </Button>
    </div>
  );
}
