"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SkeletonRows } from "@/components/ui/skeleton";
import { apiFetch, errorMessage } from "@/lib/client/api";

type Question = { id: string; question: string; options: { id: string; label: string }[] };

/** Formative MCQ: checked by deterministic SQL, does not change progress (spec 2.3). */
export function PracticeQuiz({ assignmentId, lessonId }: { assignmentId: string; lessonId: string }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, { correct: boolean; explanation: string }>>({});
  useEffect(() => {
    void apiFetch<{ questions: Question[] }>(`/api/me/practice?assignmentId=${assignmentId}&lessonId=${lessonId}`).then((r) => {
      if (r.ok) setQuestions(r.data.questions); else setError(errorMessage(r.error));
    });
  }, [assignmentId, lessonId]);
  async function check(q: Question) {
    const optionId = choice[q.id];
    if (!optionId) return;
    const r = await apiFetch<{ correct: boolean; explanation: string }>("/api/me/practice", { method: "POST",
      body: { assignmentId, lessonId, quizId: q.id, optionId } });
    if (r.ok) setFeedback((f) => ({ ...f, [q.id]: r.data }));
    else setError(errorMessage(r.error));
  }
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!questions) return <SkeletonRows rows={2} label="Загрузка вопросов" />;
  if (!questions.length) return null;
  return (
    <section aria-labelledby="practice-title" className="space-y-4">
      <h2 id="practice-title" className="text-base font-semibold">Самопроверка <span className="text-sm font-normal text-muted-foreground">(не влияет на прогресс)</span></h2>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-medium">{i + 1}. {q.question}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted">
              <input type="radio" name={`q-${q.id}`} value={o.id} checked={choice[q.id] === o.id} className="size-4"
                onChange={() => setChoice((c) => ({ ...c, [q.id]: o.id }))} />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => void check(q)} disabled={!choice[q.id]}>Проверить</Button>
            {feedback[q.id] ? (
              <p role="status" className={feedback[q.id]!.correct ? "text-sm text-success-text" : "text-sm text-warning"}>
                {feedback[q.id]!.correct ? "Верно. " : "Неверно. "}{feedback[q.id]!.explanation}
              </p>
            ) : null}
          </div>
        </fieldset>
      ))}
    </section>
  );
}
