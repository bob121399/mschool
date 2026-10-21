"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { draftPayload, type LessonInput, type ModuleInput } from "@/lib/courses/schema";
import { gradeOptions, type Grade } from "@/lib/i18n/labels";

type Chunk = { id: string; document: string; page: number; preview: string };
type CourseMeta = { id: string; title: string; description: string; target_grade: Grade; version: number; status: string; revision: number;
  objectives: string[]; coverage_gaps: string[] };

const emptyLesson = (): LessonInput => ({ title: "Новый урок", learning_outcome: "", content: "Текст урока", requires_assessment: true,
  assessment_question: "", source_chunk_ids: [], quiz: [],
  rubric: { passing_score: 80, criteria: [{ id: "C1", description: "Критерий", max_points: 100, critical: false, min_points: 0, reference: "Ожидаемые признаки" }] } });

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function lessonIssues(l: LessonInput): string[] {
  const issues: string[] = [];
  if (!l.requires_assessment) return issues;
  if (!l.assessment_question.trim()) issues.push("нет итогового вопроса");
  if (!l.rubric) { issues.push("нет рубрики"); return issues; }
  const sum = l.rubric.criteria.reduce((s, c) => s + (Number.isFinite(c.max_points) ? c.max_points : 0), 0);
  if (sum !== 100) issues.push(`сумма max_points = ${sum}, нужно 100`);
  if (l.rubric.criteria.some((c) => c.critical && c.min_points <= 0)) issues.push("critical-критерий без min_points");
  if (l.rubric.criteria.some((c) => c.min_points > c.max_points)) issues.push("min_points больше max_points");
  if (new Set(l.rubric.criteria.map((c) => c.id)).size !== l.rubric.criteria.length) issues.push("повторяются ID критериев");
  if (l.quiz.some((q) => !q.options.some((o) => o.id === q.correct_option_id))) issues.push("в квизе не выбран правильный ответ");
  return issues;
}

export function CourseEditor({ course, initialModules, chunks }: { course: CourseMeta; initialModules: ModuleInput[]; chunks: Chunk[] }) {
  const router = useRouter();
  const toast = useToast();
  const readOnly = course.status !== "draft";
  const [meta, setMeta] = useState({ title: course.title, description: course.description, target_grade: course.target_grade,
    coverage_gaps: course.coverage_gaps });
  const [modules, setModules] = useState<ModuleInput[]>(initialModules.length ? initialModules
    : [{ title: "Модуль 1", description: "", lessons: [emptyLesson()] }]);
  const [revision, setRevision] = useState(course.revision);
  const [sel, setSel] = useState({ m: 0, l: 0 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [chunkFilter, setChunkFilter] = useState("");
  const lesson = modules[sel.m]?.lessons[sel.l];
  const allIssues = useMemo(() => modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ mi, li, title: l.title, issues: lessonIssues(l) })))
    .filter((x) => x.issues.length), [modules]);

  const update = (fn: (draft: ModuleInput[]) => ModuleInput[]) => { setModules((m) => fn(structuredClone(m))); setDirty(true); };
  const updateLesson = (patch: Partial<LessonInput>) => update((all) => { Object.assign(all[sel.m]!.lessons[sel.l]!, patch); return all; });

  async function save() {
    setError(null);
    const parsed = draftPayload.safeParse({ ...meta, modules });
    if (!parsed.success) { setError(`Проверьте поля: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join("; ")}`); return false; }
    setSaving(true);
    const r = await apiFetch<{ revision: number }>(`/api/hr/courses/${course.id}`, { method: "PATCH", body: { expectedRevision: revision, payload: parsed.data } });
    setSaving(false);
    if (!r.ok) {
      if (r.error.code === "REVISION_CONFLICT") setConflict(true);
      setError(errorMessage(r.error));
      return false;
    }
    setRevision(r.data.revision);
    setDirty(false);
    toast.show("success", "Черновик сохранен");
    return true;
  }

  async function publish() {
    const r = await apiFetch(`/api/hr/courses/${course.id}/publish`, { method: "POST", body: { expectedRevision: revision, reviewConfirmed: true } });
    setPublishOpen(false);
    if (!r.ok) { setError(errorMessage(r.error)); return; }
    toast.show("success", "Курс опубликован");
    router.refresh();
  }

  async function cloneVersion() {
    const r = await apiFetch<{ courseId: string }>(`/api/hr/courses/${course.id}/clone`, { method: "POST", body: {} });
    if (!r.ok) { setError(errorMessage(r.error)); return; }
    router.push(`/hr/courses/${r.data.courseId}/edit`);
  }

  const visibleChunks = chunks.filter((c) => !chunkFilter || `${c.document} ${c.preview}`.toLowerCase().includes(chunkFilter.toLowerCase())).slice(0, 80);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={readOnly ? "success" : "neutral"}>{readOnly ? `Опубликован · v${course.version}` : `Черновик · v${course.version}`}</Badge>
        {dirty ? <Badge tone="warning">Есть несохраненные изменения</Badge> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Eye className="size-4" aria-hidden />} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? "Вернуться к редактору" : "Просмотр глазами сотрудника"}</Button>
          {readOnly ? <Button icon={<Copy className="size-4" aria-hidden />} onClick={() => void cloneVersion()}>Создать новую версию</Button> : (
            <>
              <Button variant="secondary" icon={<Save className="size-4" aria-hidden />} loading={saving} onClick={() => void save()} disabled={!dirty}>Сохранить</Button>
              <Button icon={<Upload className="size-4" aria-hidden />} disabled={dirty} title={dirty ? "Сначала сохраните изменения" : undefined}
                onClick={() => { setConfirmed(false); setPublishOpen(true); }}>Опубликовать</Button>
            </>
          )}
        </div>
      </div>
      {error ? <Alert kind="error">{error}{conflict ? <> <button type="button" className="underline" onClick={() => router.refresh()}>Загрузить актуальную версию</button> (локальные правки будут заменены)</> : null}</Alert> : null}
      {readOnly ? <Alert kind="info">Опубликованная версия не редактируется. Назначенные сотрудники проходят именно ее.</Alert> : null}

      {preview ? (
        <div className="space-y-6 rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">Режим только для чтения: прогресс и попытки не создаются. Ответы квизов и рубрика сотруднику не показываются.</p>
          {modules.map((m, mi) => (
            <section key={mi} className="space-y-3"><h2 className="text-lg font-semibold">{m.title}</h2>
              {m.lessons.map((l, li) => (
                <article key={li} className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold">{l.title}</h3>
                  <SafeMarkdown>{l.content}</SafeMarkdown>
                  {l.quiz.map((q, qi) => <p key={qi} className="mt-2 text-sm">Самопроверка: {q.question} ({q.options.map((o) => o.label).join(" / ")})</p>)}
                  {l.requires_assessment ? <p className="mt-2 rounded-lg bg-muted p-3 text-sm">Задание: {l.assessment_question || "—"}</p> : null}
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <nav aria-label="Структура курса" className="space-y-3 rounded-card border border-border bg-surface p-3">
            <TextField label="Название курса" value={meta.title} readOnly={readOnly} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); setDirty(true); }} />
            <SelectField label="Грейд" value={meta.target_grade} disabled={readOnly} options={gradeOptions}
              onChange={(e) => { setMeta({ ...meta, target_grade: e.target.value as Grade }); setDirty(true); }} />
            {modules.map((m, mi) => (
              <div key={mi} className="space-y-1">
                <div className="flex items-center gap-1">
                  <input aria-label={`Название модуля ${mi + 1}`} value={m.title} readOnly={readOnly}
                    onChange={(e) => update((all) => { all[mi]!.title = e.target.value; return all; })}
                    className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm font-semibold" />
                  {!readOnly ? <>
                    <button type="button" aria-label="Модуль выше" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
                      onClick={() => update((all) => move(all, mi, mi - 1))}><ArrowUp className="size-4" aria-hidden /></button>
                    <button type="button" aria-label="Модуль ниже" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
                      onClick={() => update((all) => move(all, mi, mi + 1))}><ArrowDown className="size-4" aria-hidden /></button>
                  </> : null}
                </div>
                <ol className="space-y-1 pl-2">
                  {m.lessons.map((l, li) => {
                    const bad = lessonIssues(l).length > 0;
                    return (
                      <li key={li} className="flex items-center gap-1">
                        <button type="button" onClick={() => setSel({ m: mi, l: li })} aria-current={sel.m === mi && sel.l === li ? "true" : undefined}
                          className={cn("min-h-9 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm", sel.m === mi && sel.l === li ? "bg-muted font-medium" : "hover:bg-muted")}>
                          {l.title}{bad ? <span className="text-warning"> ⚠<span className="sr-only"> есть проблемы</span></span> : null}
                        </button>
                        {!readOnly ? <>
                          <button type="button" aria-label="Урок выше" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
                            onClick={() => { update((all) => { all[mi]!.lessons = move(all[mi]!.lessons, li, li - 1); return all; }); setSel({ m: mi, l: Math.max(0, li - 1) }); }}>
                            <ArrowUp className="size-4" aria-hidden /></button>
                          <button type="button" aria-label="Урок ниже" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
                            onClick={() => { update((all) => { all[mi]!.lessons = move(all[mi]!.lessons, li, li + 1); return all; }); setSel({ m: mi, l: Math.min(m.lessons.length - 1, li + 1) }); }}>
                            <ArrowDown className="size-4" aria-hidden /></button>
                        </> : null}
                      </li>
                    );
                  })}
                </ol>
                {!readOnly ? <Button variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => { update((all) => { all[mi]!.lessons.push(emptyLesson()); return all; }); setSel({ m: mi, l: m.lessons.length }); }}>Урок</Button> : null}
              </div>
            ))}
            {!readOnly ? <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />}
              onClick={() => update((all) => [...all, { title: `Модуль ${all.length + 1}`, description: "", lessons: [emptyLesson()] }])}>Модуль</Button> : null}
          </nav>

          {lesson ? (
            <section aria-label="Урок" className="min-w-0 space-y-4 rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1"><TextField label="Название урока" value={lesson.title} readOnly={readOnly} onChange={(e) => updateLesson({ title: e.target.value })} /></div>
                {!readOnly && (modules[sel.m]?.lessons.length ?? 0) > 1 ? <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />}
                  onClick={() => { update((all) => { all[sel.m]!.lessons.splice(sel.l, 1); return all; }); setSel({ m: sel.m, l: 0 }); }}>Удалить урок</Button> : null}
              </div>
              <TextField label="Измеримый результат обучения" value={lesson.learning_outcome} readOnly={readOnly} onChange={(e) => updateLesson({ learning_outcome: e.target.value })} />
              <TextArea label="Текст урока (Markdown без HTML)" maxChars={24000} value={lesson.content} readOnly={readOnly} className="min-h-64 font-mono text-[13px]"
                onChange={(e) => updateLesson({ content: e.target.value })} />
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={lesson.requires_assessment} disabled={readOnly}
                  onChange={(e) => updateLesson({ requires_assessment: e.target.checked })} />
                Урок завершается итоговым заданием (иначе — «Завершить чтение»)
              </label>
              {lesson.requires_assessment ? (
                <TextArea label="Итоговое открытое задание" maxChars={6000} value={lesson.assessment_question} readOnly={readOnly}
                  onChange={(e) => updateLesson({ assessment_question: e.target.value })} />
              ) : null}
              <QuizEditor quiz={lesson.quiz} readOnly={readOnly} onChange={(quiz) => updateLesson({ quiz })} />
            </section>
          ) : <p>Выберите урок</p>}

          {lesson ? (
            <aside aria-label="Источники и рубрика" className="space-y-4">
              <RubricEditor lesson={lesson} readOnly={readOnly} onChange={(rubric) => updateLesson({ rubric })} />
              <section className="space-y-2 rounded-card border border-border bg-surface p-4">
                <h2 className="font-semibold">Источники урока ({lesson.source_chunk_ids.length})</h2>
                <input type="search" aria-label="Фильтр фрагментов" placeholder="Фильтр фрагментов" value={chunkFilter} onChange={(e) => setChunkFilter(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" />
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {visibleChunks.map((c) => (
                    <li key={c.id}>
                      <label className="flex gap-2 rounded-md p-1 text-xs hover:bg-muted">
                        <input type="checkbox" className="mt-0.5 size-4 shrink-0" disabled={readOnly} checked={lesson.source_chunk_ids.includes(c.id)}
                          onChange={(e) => updateLesson({ source_chunk_ids: e.target.checked ? [...lesson.source_chunk_ids, c.id].slice(0, 20)
                            : lesson.source_chunk_ids.filter((x) => x !== c.id) })} />
                        <span><strong>{c.document}, с. {c.page}:</strong> {c.preview}</span>
                      </label>
                    </li>
                  ))}
                  {chunks.length === 0 ? <li className="text-xs text-muted-foreground">Нет подтвержденных источников.</li> : null}
                </ul>
              </section>
            </aside>
          ) : null}
        </div>
      )}

      <Dialog open={publishOpen} onOpenChange={setPublishOpen} wide title={`Публикация: ${meta.title}`}
        description="После публикации версия становится неизменяемой. Действие фиксируется в журнале."
        footer={<><Button variant="secondary" onClick={() => setPublishOpen(false)}>Отмена</Button>
          <Button disabled={!confirmed || allIssues.length > 0} onClick={() => void publish()}>Опубликовать</Button></>}>
        <div className="space-y-3 text-sm">
          {meta.coverage_gaps.length ? <Alert kind="warning" title="Пробелы покрытия от методиста"><ul className="list-disc pl-5">{meta.coverage_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></Alert> : null}
          {allIssues.length ? <Alert kind="error" title="Нужно исправить"><ul className="list-disc pl-5">{allIssues.map((x) => <li key={`${x.mi}-${x.li}`}>{x.title}: {x.issues.join(", ")}</li>)}</ul></Alert>
            : <Alert kind="success">Все оцениваемые уроки имеют задание и рубрику с суммой 100; critical-критерии заданы.</Alert>}
          <ul className="list-disc pl-5 text-muted-foreground">
            {modules.flatMap((m) => m.lessons).filter((l) => l.rubric).map((l, i) => (
              <li key={i}>{l.title}: проходной балл {l.rubric!.passing_score}; обязательные: {l.rubric!.criteria.filter((c) => c.critical).map((c) => `${c.id} ≥ ${c.min_points}`).join(", ") || "нет"}</li>
            ))}
          </ul>
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Я проверил(а) источники, уроки, квизы и рубрики и подтверждаю публикацию.</label>
        </div>
      </Dialog>
    </div>
  );
}

function RubricEditor({ lesson, readOnly, onChange }: { lesson: LessonInput; readOnly: boolean; onChange: (r: LessonInput["rubric"]) => void }) {
  if (!lesson.requires_assessment) return null;
  const rubric = lesson.rubric ?? { passing_score: 80, criteria: [] };
  const sum = rubric.criteria.reduce((s, c) => s + (c.max_points || 0), 0);
  const set = (criteria: typeof rubric.criteria, passing = rubric.passing_score) => onChange({ criteria, passing_score: passing });
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Рубрика</h2>
        <Badge tone={sum === 100 ? "success" : "danger"}>Сумма: {sum} / 100</Badge></div>
      <TextField label="Проходной балл" type="number" min={1} max={100} value={rubric.passing_score} readOnly={readOnly}
        onChange={(e) => set(rubric.criteria, Number(e.target.value))} />
      {rubric.criteria.map((c, i) => (
        <fieldset key={i} className="space-y-2 rounded-lg border border-border p-2">
          <legend className="px-1 text-xs font-medium">Критерий {c.id}</legend>
          <TextField label="ID" value={c.id} readOnly={readOnly} maxLength={16} onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} />
          <TextArea label="Наблюдаемый признак" value={c.description} readOnly={readOnly} className="min-h-16" onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
          <TextArea label="Эталон (скрыт от сотрудника)" value={c.reference} readOnly={readOnly} className="min-h-16" onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="max_points" type="number" min={1} max={100} value={c.max_points} readOnly={readOnly} onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, max_points: Number(e.target.value) } : x))} />
            <TextField label="min_points" type="number" min={0} max={100} value={c.min_points} readOnly={readOnly} onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, min_points: Number(e.target.value) } : x))} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={c.critical} disabled={readOnly}
            onChange={(e) => set(rubric.criteria.map((x, j) => j === i ? { ...x, critical: e.target.checked } : x))} />Обязательное правило (critical)</label>
          {!readOnly && rubric.criteria.length > 1 ? <Button variant="ghost" size="sm" onClick={() => set(rubric.criteria.filter((_, j) => j !== i))}>Удалить критерий</Button> : null}
        </fieldset>
      ))}
      {!readOnly && rubric.criteria.length < 20 ? <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />}
        onClick={() => set([...rubric.criteria, { id: `C${rubric.criteria.length + 1}`, description: "", max_points: 10, critical: false, min_points: 0, reference: "" }])}>Критерий</Button> : null}
    </section>
  );
}

function QuizEditor({ quiz, readOnly, onChange }: { quiz: LessonInput["quiz"]; readOnly: boolean; onChange: (q: LessonInput["quiz"]) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Формативные вопросы (MCQ)</h2>
      {quiz.map((q, i) => (
        <fieldset key={i} className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium">Вопрос {i + 1}</legend>
          <TextField label="Вопрос" value={q.question} readOnly={readOnly} onChange={(e) => onChange(quiz.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} />
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input type="radio" name={`correct-${i}`} aria-label={`Правильный ответ: вариант ${o.id}`} className="size-5" disabled={readOnly}
                checked={q.correct_option_id === o.id} onChange={() => onChange(quiz.map((x, j) => j === i ? { ...x, correct_option_id: o.id } : x))} />
              <input aria-label={`Вариант ${o.id}`} value={o.label} readOnly={readOnly} className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
                onChange={(e) => onChange(quiz.map((x, j) => j === i ? { ...x, options: x.options.map((y, k) => k === oi ? { ...y, label: e.target.value } : y) } : x))} />
            </div>
          ))}
          {!readOnly && q.options.length < 6 ? <Button variant="ghost" size="sm" onClick={() => onChange(quiz.map((x, j) => j === i
            ? { ...x, options: [...x.options, { id: String.fromCharCode(97 + x.options.length), label: "" }] } : x))}>Вариант</Button> : null}
          <TextField label="Пояснение" value={q.explanation} readOnly={readOnly} onChange={(e) => onChange(quiz.map((x, j) => j === i ? { ...x, explanation: e.target.value } : x))} />
          {!readOnly ? <Button variant="ghost" size="sm" onClick={() => onChange(quiz.filter((_, j) => j !== i))}>Удалить вопрос</Button> : null}
        </fieldset>
      ))}
      {!readOnly && quiz.length < 5 ? <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />}
        onClick={() => onChange([...quiz, { question: "", options: [{ id: "a", label: "" }, { id: "b", label: "" }], correct_option_id: "a", explanation: "" }])}>Вопрос</Button> : null}
    </section>
  );
}
