"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { apiFetch, errorMessage } from "@/lib/client/api";

type Result = { passed: boolean; score: number; feedback: string };
type State =
  | { kind: "idle" } | { kind: "checking" } | { kind: "passed"; result: Result; attemptId?: string }
  | { kind: "needs_revision"; result: Result; attemptId?: string } | { kind: "technical_error"; code: string; message: string };

const storageKey = (a: string, l: string) => `mschool:attempt:${a}:${l}`;

/** Assessment state machine (spec 4.2/4.5). sessionStorage keeps only the request id — never the
 * answer text; after refresh the state is restored from the server. Completion is shown only after
 * the server confirms the DB commit. */
export function AssessmentPanel({ assignmentId, lessonId, question, alreadyCompleted }: {
  assignmentId: string; lessonId: string; question: string; alreadyCompleted: boolean;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const requestRef = useRef<{ id: string; text: string } | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealState, setAppealState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(storageKey(assignmentId, lessonId)); } catch { saved = null; }
    const restore = async (id: string) => {
      const r = await apiFetch<{ attempt_id: string; status: string; result: Result | null; error_code: string | null }>(`/api/me/attempts/${id}`);
      if (cancelled) return;
      if (!r.ok) { sessionStorage.removeItem(storageKey(assignmentId, lessonId)); return; }
      if (r.data.status === "succeeded" && r.data.result) {
        setState({ kind: r.data.result.passed ? "passed" : "needs_revision", result: r.data.result, attemptId: r.data.attempt_id });
      } else if (r.data.status === "running") {
        setState({ kind: "checking" });
        setTimeout(() => void restore(id), 3000);
      } else {
        setState({ kind: "technical_error", code: r.data.error_code ?? "UNKNOWN", message: "Предыдущая проверка не завершилась. Отправьте ответ снова." });
        sessionStorage.removeItem(storageKey(assignmentId, lessonId));
      }
    };
    if (saved) void restore(saved);
    return () => { cancelled = true; };
  }, [assignmentId, lessonId]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = answer.trim();
    if (!text) return;
    // A new idempotency key only for new text or an intentional new attempt.
    if (!requestRef.current || requestRef.current.text !== text) requestRef.current = { id: crypto.randomUUID(), text };
    const id = requestRef.current.id;
    try { sessionStorage.setItem(storageKey(assignmentId, lessonId), id); } catch { /* storage unavailable */ }
    setState({ kind: "checking" });
    const r = await apiFetch<Result>("/api/agents/assessor", { method: "POST", body: { assignmentId, lessonId, requestId: id, answer: text } });
    if (!r.ok) {
      setState({ kind: "technical_error", code: r.error.code, message: errorMessage(r.error) });
      return;
    }
    const status = await apiFetch<{ attempt_id: string }>(`/api/me/attempts/${id}`);
    const attemptId = status.ok ? status.data.attempt_id : undefined;
    setState({ kind: r.data.passed ? "passed" : "needs_revision", result: r.data, attemptId });
    if (r.data.passed) router.refresh();
  }

  function newAttempt() {
    requestRef.current = null;
    try { sessionStorage.removeItem(storageKey(assignmentId, lessonId)); } catch { /* ignore */ }
    setState({ kind: "idle" });
  }

  async function appeal() {
    if (state.kind !== "passed" && state.kind !== "needs_revision") return;
    if (!state.attemptId) return;
    const r = await apiFetch("/api/me/appeals", { method: "POST", body: { attemptId: state.attemptId, reason: appealReason } });
    setAppealState(r.ok ? "Апелляция отправлена. Решение примет HR; исходная оценка сохраняется." : errorMessage(r.error));
    if (r.ok) setAppealOpen(false);
  }

  const checking = state.kind === "checking";
  return (
    <section aria-labelledby="assess-title" className="space-y-4">
      <h2 id="assess-title" className="text-base font-semibold">Итоговое задание урока</h2>
      <div className="rounded-xl bg-muted p-4 text-sm"><SafeMarkdown>{question}</SafeMarkdown></div>
      {alreadyCompleted && state.kind === "idle" ? (
        <Alert kind="success" title="Урок уже пройден">Повторная отправка не требуется.</Alert>
      ) : null}
      {state.kind === "passed" ? (
        <div role="status" className="space-y-2 rounded-xl border border-success/50 bg-success/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-success-text"><CheckCircle2 className="size-5 text-success" aria-hidden /> Задание пройдено · {state.result.score} баллов</p>
          <SafeMarkdown className="prose-mschool text-sm">{state.result.feedback}</SafeMarkdown>
        </div>
      ) : null}
      {state.kind === "needs_revision" ? (
        <div role="status" className="space-y-2 rounded-xl border border-warning/50 bg-warning/10 p-4">
          <p className="font-semibold">Нужна доработка · {state.result.score} баллов</p>
          <SafeMarkdown className="prose-mschool text-sm">{state.result.feedback}</SafeMarkdown>
          <p className="text-xs text-muted-foreground">Обязательные критерии должны быть выполнены полностью. Следующий урок пока закрыт.</p>
        </div>
      ) : null}
      {state.kind === "technical_error" ? (
        <Alert kind="error" title="Проверка не выполнена">{state.message} Это техническая ошибка, а не оценка ответа.</Alert>
      ) : null}
      {appealState ? <Alert kind="info">{appealState}</Alert> : null}
      {state.kind !== "passed" && !(alreadyCompleted && state.kind === "idle") ? (
        <form onSubmit={submit} className="space-y-3">
          <TextArea label="Ваш ответ" maxChars={12000} value={answer} readOnly={checking}
            onChange={(e) => setAnswer(e.target.value)} helper="Отвечайте своими словами по регламенту урока." />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={checking} loadingText="Проверяем ответ…" disabled={!answer.trim() || answer.length > 12000}>
              {state.kind === "technical_error" ? "Повторить проверку" : "Отправить на проверку"}
            </Button>
            {state.kind === "needs_revision" ? (
              <Button variant="secondary" onClick={newAttempt} icon={<RotateCcw className="size-4" aria-hidden />}>Новая попытка</Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {(state.kind === "passed" || state.kind === "needs_revision") && state.attemptId ? (
        <Button variant="ghost" onClick={() => setAppealOpen(true)}>Подать апелляцию</Button>
      ) : null}
      <Dialog open={appealOpen} onOpenChange={setAppealOpen} title="Апелляция оценки"
        description="Опишите, почему оценка неверна. Решение принимает HR вашей компании."
        footer={<><Button variant="secondary" onClick={() => setAppealOpen(false)}>Отмена</Button>
          <Button onClick={() => void appeal()} disabled={appealReason.trim().length < 10}>Отправить</Button></>}>
        <TextArea label="Причина" maxChars={4000} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} required />
      </Dialog>
    </section>
  );
}
