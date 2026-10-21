"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { gradeOptions, type Grade } from "@/lib/i18n/labels";
import { JobStatus } from "./job-status";

export function CoursesActions({ approvedDocs, recentJobs }: { approvedDocs: { id: string; title: string }[]; recentJobs: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "create" | "generate">(null);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState<Grade>("junior");
  const [docs, setDocs] = useState<string[]>([]);
  const [modules, setModules] = useState(3);
  const [lessons, setLessons] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button icon={<Sparkles className="size-4" aria-hidden />} onClick={() => { setOpen("generate"); setError(null); }}>Черновик от методиста</Button>
        <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => { setOpen("create"); setError(null); }}>Пустой черновик</Button>
      </div>
      {recentJobs.length ? (
        <div className="space-y-2 rounded-card border border-border bg-surface p-4">
          <p className="text-sm font-medium">Задачи методиста</p>
          {recentJobs.map((id) => <JobStatus key={id} jobId={id} />)}
        </div>
      ) : null}
      <Dialog open={open === "create"} onOpenChange={(o) => !o && setOpen(null)} title="Новый черновик курса"
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Отмена</Button><Button loading={loading} disabled={!title.trim()} onClick={async () => {
          setLoading(true);
          const r = await apiFetch<{ courseId: string }>("/api/hr/courses", { method: "POST", body: { title, grade } });
          setLoading(false);
          if (!r.ok) { setError(errorMessage(r.error)); return; }
          router.push(`/hr/courses/${r.data.courseId}/edit`);
        }}>Создать</Button></>}>
        <div className="space-y-4">
          {error ? <Alert kind="error">{error}</Alert> : null}
          <TextField label="Название" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
          <SelectField label="Грейд" value={grade} onChange={(e) => setGrade(e.target.value as Grade)} options={gradeOptions} />
        </div>
      </Dialog>
      <Dialog open={open === "generate"} wide onOpenChange={(o) => !o && setOpen(null)} title="Черновик от AI-методиста"
        description="Методист использует только подтвержденные источники вашей компании и создает черновик. Публикует курс только HR."
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Закрыть</Button>{!jobId ? <Button loading={loading}
          disabled={!title.trim() || docs.length === 0} onClick={async () => {
            setLoading(true); setError(null);
            const r = await apiFetch<{ jobId: string }>("/api/hr/course-jobs", { method: "POST",
              body: { documentIds: docs, grade, title, maxModules: modules, maxLessons: lessons } });
            setLoading(false);
            if (!r.ok) { setError(errorMessage(r.error)); return; }
            setJobId(r.data.jobId);
            router.refresh();
          }}>Запустить</Button> : null}</>}>
        <div className="space-y-4">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {jobId ? <JobStatus jobId={jobId} /> : (
            approvedDocs.length === 0 ? <Alert kind="warning">Нет подтвержденных источников. Сначала загрузите и подтвердите регламент.</Alert> : (
              <>
                <fieldset className="space-y-2"><legend className="text-sm font-medium">Подтвержденные источники</legend>
                  {approvedDocs.map((d) => (
                    <label key={d.id} className="flex min-h-11 items-center gap-3 text-sm">
                      <input type="checkbox" className="size-5" checked={docs.includes(d.id)}
                        onChange={(e) => setDocs((x) => e.target.checked ? [...x, d.id] : x.filter((y) => y !== d.id))} />{d.title}
                    </label>
                  ))}
                </fieldset>
                <TextField label="Название курса" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
                <SelectField label="Грейд" value={grade} onChange={(e) => setGrade(e.target.value as Grade)} options={gradeOptions} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Макс. модулей (≤12)" type="number" min={1} max={12} value={modules} onChange={(e) => setModules(Number(e.target.value))} />
                  <TextField label="Макс. уроков (≤60)" type="number" min={1} max={60} value={lessons} onChange={(e) => setLessons(Number(e.target.value))} />
                </div>
                <p className="text-xs text-muted-foreground">Объем согласуется до запуска: вызов ИИ платный, результат не обрезается после генерации.</p>
              </>
            ))}
        </div>
      </Dialog>
    </div>
  );
}
