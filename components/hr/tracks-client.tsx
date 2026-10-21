"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { gradeLabel, gradeOptions, type Grade } from "@/lib/i18n/labels";

type Course = { id: string; title: string; version: number; target_grade: Grade };
type Track = { id: string; title: string; version: number; target_grade: Grade; status: string; revision: number; courses: string[] };

export function TracksClient({ tracks, courses }: { tracks: Track[]; courses: Course[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState<Grade>("junior");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const available = courses.filter((c) => c.target_grade === grade && !picked.includes(c.id));
  const move = (i: number, d: number) => setPicked((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  async function publish(t: Track) {
    const r = await apiFetch(`/api/hr/tracks/${t.id}/publish`, { method: "POST", body: { expectedRevision: t.revision } });
    if (!r.ok) setError(errorMessage(r.error)); else { toast.show("success", "Трек опубликован"); router.refresh(); }
  }
  return (
    <div className="space-y-4">
      {error ? <Alert kind="error">{error}</Alert> : null}
      <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => { setOpen(true); setPicked([]); setError(null); }}>Новый трек</Button>
      <ul className="space-y-3">
        {tracks.map((t) => (
          <li key={t.id} className="rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t.title}</p><Badge>v{t.version}</Badge><Badge>{gradeLabel(t.target_grade)}</Badge>
              <Badge tone={t.status === "published" ? "success" : "neutral"}>{t.status === "published" ? "Опубликован" : "Черновик"}</Badge>
              {t.status === "draft" ? <Button size="sm" className="ml-auto" onClick={() => void publish(t)}>Опубликовать</Button> : null}
            </div>
            <ol className="mt-2 list-decimal pl-5 text-sm text-muted-foreground">{t.courses.map((c, i) => <li key={i}>{c}</li>)}</ol>
          </li>
        ))}
        {tracks.length === 0 ? <li className="text-sm text-muted-foreground">Треков пока нет. Трек — фиксированный упорядоченный набор опубликованных версий курсов одного грейда.</li> : null}
      </ul>
      <Dialog open={open} onOpenChange={setOpen} wide title="Новый трек" description="Состав и порядок фиксируются; после публикации изменить нельзя — только новая версия трека."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button><Button disabled={!title.trim() || picked.length === 0} onClick={async () => {
          const r = await apiFetch("/api/hr/tracks", { method: "POST", body: { title, grade, courseIds: picked } });
          if (!r.ok) { setError(errorMessage(r.error)); return; }
          setOpen(false); toast.show("success", "Черновик трека создан"); router.refresh();
        }}>Создать черновик</Button></>}>
        <div className="space-y-4">
          <TextField label="Название" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <SelectField label="Грейд" value={grade} options={gradeOptions} onChange={(e) => { setGrade(e.target.value as Grade); setPicked([]); }} />
          <div>
            <p className="mb-1 text-sm font-medium">Порядок курсов</p>
            <ol className="space-y-1">
              {picked.map((id, i) => {
                const c = courses.find((x) => x.id === id)!;
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{i + 1}. {c.title} v{c.version}</span>
                    <button type="button" aria-label="Выше" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></button>
                    <button type="button" aria-label="Ниже" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></button>
                    <button type="button" className="text-xs underline" onClick={() => setPicked((p) => p.filter((x) => x !== id))}>Убрать</button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Опубликованные курсы грейда {gradeLabel(grade)}</p>
            <ul className="space-y-1">{available.map((c) => (
              <li key={c.id}><Button size="sm" variant="ghost" onClick={() => setPicked((p) => [...p, c.id])}>+ {c.title} v{c.version}</Button></li>
            ))}{available.length === 0 ? <li className="text-sm text-muted-foreground">Нет доступных опубликованных курсов этого грейда.</li> : null}</ul>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
