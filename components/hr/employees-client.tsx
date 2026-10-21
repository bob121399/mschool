"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, UserPlus, Route as RouteIcon } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatDate, gradeLabel, gradeOptions, type Grade } from "@/lib/i18n/labels";

export type EmployeeRow = { id: string; email: string; fullName: string; grade: Grade; status: "active" | "suspended";
  departmentId: string | null; assignment: { track: string; dueAt: string | null; completed: number; total: number } | null };
type Track = { id: string; title: string; version: number; target_grade: Grade };
type Dept = { id: string; name: string };
type Invite = { id: string; email: string; target_grade: Grade; expires_at: string };

export function EmployeesClient({ rows, total, page, pageSize, sort, dir, departments, tracks, pendingInvites }: {
  rows: EmployeeRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc";
  departments: Dept[]; tracks: Track[]; pendingInvites: Invite[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "invite" | "import" | "assign" | "dept" | { edit: EmployeeRow }>(null);
  const depName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "—";
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = (msg: string) => { setDialog(null); toast.show("success", msg); router.refresh(); };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setDialog("invite")}>Пригласить</Button>
        <Button variant="secondary" icon={<Upload className="size-4" aria-hidden />} onClick={() => setDialog("import")}>Импорт CSV</Button>
        <Button variant="secondary" icon={<RouteIcon className="size-4" aria-hidden />} disabled={selected.size === 0} onClick={() => setDialog("assign")}>
          Назначить трек ({selected.size})
        </Button>
        <Button variant="ghost" onClick={() => setDialog("dept")}>Добавить подразделение</Button>
      </div>
      <DataTable caption="Сотрудники компании" searchLabel="Поиск по email или имени" total={total} page={page} pageSize={pageSize} sort={sort} dir={dir}
        columns={[{ key: "select", label: "Выбор" }, { key: "email", label: "Сотрудник", sortable: true }, { key: "department", label: "Подразделение" },
          { key: "grade", label: "Грейд", sortable: true }, { key: "assignment", label: "Назначение и прогресс" }, { key: "due", label: "Срок" },
          { key: "status", label: "Статус" }, { key: "actions", label: "Действия" }]}
        empty={<EmptyState title="Сотрудников пока нет" description="Пригласите первого сотрудника по email." />}
        rows={rows.map((r) => ({ key: r.id, cells: [
          <input key="c" type="checkbox" className="size-5" aria-label={`Выбрать ${r.email}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />,
          <div key="n"><p className="font-medium">{r.fullName || r.email}</p>{r.fullName ? <p className="text-xs text-muted-foreground">{r.email}</p> : null}</div>,
          depName(r.departmentId), gradeLabel(r.grade),
          r.assignment ? <span key="a">{r.assignment.track}<br /><span className="text-xs text-muted-foreground">{r.assignment.completed} из {r.assignment.total} уроков</span></span> : "Нет назначения",
          r.assignment?.dueAt ? formatDate(r.assignment.dueAt) : "—",
          <Badge key="s" tone={r.status === "active" ? "success" : "warning"}>{r.status === "active" ? "Активен" : "Приостановлен"}</Badge>,
          <Button key="e" variant="ghost" size="sm" onClick={() => setDialog({ edit: r })}>Изменить</Button>,
        ] }))} />
      {pendingInvites.length ? (
        <section aria-labelledby="inv-title" className="space-y-2">
          <h2 id="inv-title" className="text-base font-semibold">Ожидающие приглашения</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface text-sm">
            {pendingInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>{i.email} · {gradeLabel(i.target_grade)}</span>
                <span className="text-muted-foreground">{new Date(i.expires_at) < new Date() ? "Истекло" : `до ${formatDate(i.expires_at)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {dialog === "invite" ? <InviteDialog departments={departments} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog === "import" ? <ImportDialog onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog === "dept" ? <DeptDialog onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog === "assign" ? <AssignDialog tracks={tracks} rows={rows.filter((r) => selected.has(r.id))} onClose={() => setDialog(null)}
        onDone={(m) => { setSelected(new Set()); done(m); }} /> : null}
      {dialog && typeof dialog === "object" ? <EditDialog row={dialog.edit} departments={departments} onClose={() => setDialog(null)} onDone={done} /> : null}
    </div>
  );
}

function InviteDialog({ departments, onClose, onDone }: { departments: Dept[]; onClose: () => void; onDone: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState<Grade>("junior");
  const [dept, setDept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  async function send() {
    setLoading(true); setError(null);
    const r = await apiFetch<{ delivery: string; accept_path?: string }>("/api/hr/invitations", { method: "POST",
      body: { email, grade, departmentId: dept || null } });
    setLoading(false);
    if (!r.ok) { setError(errorMessage(r.error)); return; }
    if (r.data.delivery === "existing_account" && r.data.accept_path) { setLink(`${window.location.origin}${r.data.accept_path}`); return; }
    onDone("Приглашение отправлено");
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Пригласить сотрудника" description="Письмо отправляется только после нажатия «Отправить». Ссылка действует 72 часа."
      footer={<><Button variant="secondary" onClick={onClose}>Закрыть</Button>{link ? null : <Button onClick={send} loading={loading} disabled={!email}>Отправить</Button>}</>}>
      <div className="space-y-4">
        {error ? <Alert kind="error">{error}</Alert> : null}
        {link ? <Alert kind="info" title="У этого адреса уже есть учетная запись">Передайте сотруднику ссылку для принятия приглашения по защищенному каналу: <code className="break-all">{link}</code></Alert> : null}
        <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Грейд" value={grade} onChange={(e) => setGrade(e.target.value as Grade)} options={gradeOptions} />
        <SelectField label="Подразделение" value={dept} onChange={(e) => setDept(e.target.value)}
          options={[{ value: "", label: "Не указано" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
      </div>
    </Dialog>
  );
}

type PreviewRow = { line: number; email: string; grade: string; department: string; errors: string[] };
function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ total: number; valid: number; rows: PreviewRow[] } | null>(null);
  const [report, setReport] = useState<{ accepted: number; rejected: number; report: { line: number; email: string; status: string; code?: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function run(mode: "preview" | "confirm") {
    setLoading(true); setError(null);
    const r = await apiFetch<typeof preview & typeof report>("/api/hr/invitations/import", { method: "POST", body: { mode, csv } });
    setLoading(false);
    if (!r.ok) { setError(errorMessage(r.error)); return; }
    if (mode === "preview") setPreview(r.data as never); else setReport(r.data as never);
  }
  return (
    <Dialog open wide onOpenChange={(o) => !o && onClose()} title="Импорт приглашений из CSV"
      description="Колонки: email, grade (junior/middle/senior/head), department. Не более 500 строк. Сначала предпросмотр, затем отправка."
      footer={<>
        <Button variant="secondary" onClick={report ? () => onDone(`Принято: ${report.accepted}, отклонено: ${report.rejected}`) : onClose}>{report ? "Готово" : "Отмена"}</Button>
        {!report ? <Button variant="secondary" onClick={() => run("preview")} loading={loading && !preview} disabled={!csv}>Предпросмотр</Button> : null}
        {preview && !report ? <Button onClick={() => run("confirm")} loading={loading} disabled={preview.valid === 0}>Отправить {preview.valid} приглашений</Button> : null}
      </>}>
      <div className="space-y-4">
        {error ? <Alert kind="error">{error}</Alert> : null}
        {!report ? (
          <>
            <input type="file" accept=".csv,text/csv" aria-label="CSV-файл" onChange={async (e) => {
              const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPreview(null); }
            }} />
            <TextArea label="Содержимое CSV" value={csv} maxChars={200000} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
          </>
        ) : null}
        {preview && !report ? (
          <div className="max-h-72 overflow-auto text-sm">
            <p className="mb-2">Строк: {preview.total}, без ошибок: {preview.valid}</p>
            <table className="w-full"><thead><tr className="text-left"><th className="p-1">Строка</th><th className="p-1">Email</th><th className="p-1">Ошибки</th></tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.line} className="border-t border-border"><td className="p-1">{r.line}</td><td className="p-1">{r.email}</td>
                  <td className="p-1">{r.errors.length ? <span className="text-danger">{r.errors.join(", ")}</span> : "—"}</td></tr>))}</tbody></table>
          </div>
        ) : null}
        {report ? (
          <div className="max-h-72 overflow-auto text-sm">
            <p className="mb-2">Принято: {report.accepted}. Отклонено: {report.rejected}.</p>
            <ul>{report.report.map((r) => <li key={r.line}>{r.line}: {r.email} — {r.status === "accepted" ? "принято" : `отклонено (${r.code})`}</li>)}</ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function DeptDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Новое подразделение"
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button disabled={!name.trim()} onClick={async () => {
        const r = await apiFetch("/api/hr/departments", { method: "POST", body: { name } });
        if (!r.ok) setError(errorMessage(r.error)); else onDone("Подразделение добавлено");
      }}>Добавить</Button></>}>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Название" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
    </Dialog>
  );
}

function EditDialog({ row, departments, onClose, onDone }: { row: EmployeeRow; departments: Dept[]; onClose: () => void; onDone: (m: string) => void }) {
  const [grade, setGrade] = useState<Grade>(row.grade);
  const [dept, setDept] = useState(row.departmentId ?? "");
  const [status, setStatus] = useState(row.status);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const gradeChanged = grade !== row.grade;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Сотрудник: ${row.fullName || row.email}`}
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={loading} onClick={async () => {
        setLoading(true);
        const r = await apiFetch(`/api/hr/employees/${row.id}`, { method: "PATCH", body: {
          ...(gradeChanged ? { grade } : {}), departmentId: dept || null, ...(status !== row.status ? { status } : {}) } });
        setLoading(false);
        if (!r.ok) setError(errorMessage(r.error)); else onDone("Изменения сохранены");
      }}>Сохранить</Button></>}>
      <div className="space-y-4">
        {error ? <Alert kind="error">{error}</Alert> : null}
        <SelectField label="Грейд" value={grade} onChange={(e) => setGrade(e.target.value as Grade)} options={gradeOptions} />
        {gradeChanged && row.assignment ? <Alert kind="warning">Активное назначение «{row.assignment.track}» будет отменено. Новый трек нужно назначить отдельно.</Alert> : null}
        <SelectField label="Подразделение" value={dept} onChange={(e) => setDept(e.target.value)}
          options={[{ value: "", label: "Не указано" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <SelectField label="Статус" value={status} onChange={(e) => setStatus(e.target.value as "active" | "suspended")}
          options={[{ value: "active", label: "Активен" }, { value: "suspended", label: "Приостановлен (теряет доступ)" }]} />
      </div>
    </Dialog>
  );
}

function AssignDialog({ tracks, rows, onClose, onDone }: { tracks: Track[]; rows: EmployeeRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [result, setResult] = useState<{ userId: string; ok: boolean; code?: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const track = tracks.find((t) => t.id === trackId);
  const compatible = rows.filter((r) => r.grade === track?.target_grade && r.status === "active");
  const incompatible = rows.length - compatible.length;
  return (
    <Dialog open wide onOpenChange={(o) => !o && onClose()} title="Назначить трек"
      footer={<><Button variant="secondary" onClick={result ? () => onDone("Назначение выполнено") : onClose}>{result ? "Готово" : "Отмена"}</Button>
        {!result ? <Button loading={loading} disabled={!track || compatible.length === 0} onClick={async () => {
          setLoading(true);
          const r = await apiFetch<{ results: { userId: string; ok: boolean; code?: string }[] }>("/api/hr/assignments", { method: "POST",
            body: { userIds: compatible.map((c) => c.id), trackId, dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null } });
          setLoading(false);
          if (r.ok) setResult(r.data.results);
        }}>Назначить {compatible.length}</Button> : null}</>}>
      {tracks.length === 0 ? <Alert kind="warning">Нет опубликованных треков. Опубликуйте трек в разделе «Треки».</Alert> : (
        <div className="space-y-4">
          <SelectField label="Трек (опубликованная версия)" value={trackId} onChange={(e) => setTrackId(e.target.value)}
            options={tracks.map((t) => ({ value: t.id, label: `${t.title} · v${t.version} · ${gradeLabel(t.target_grade)}` }))} />
          <TextField label="Срок (необязательно)" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <p className="text-sm">Выбрано: {rows.length}. Подходят по грейду и статусу: {compatible.length}.
            {incompatible > 0 ? <strong> Не будут назначены (другой грейд или приостановлены): {incompatible}.</strong> : null}</p>
          {result ? (
            <ul className="text-sm">{result.map((r) => {
              const row = rows.find((x) => x.id === r.userId);
              return <li key={r.userId}>{row?.email}: {r.ok ? "назначено" : `не назначено (${errorMessage({ code: r.code ?? "", status: 409 })})`}</li>;
            })}</ul>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
