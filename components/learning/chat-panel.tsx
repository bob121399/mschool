"use client";
import { useState, type FormEvent } from "react";
import { BookOpen, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { apiFetch, errorMessage } from "@/lib/client/api";

type Citation = { source_id: string; title: string; page: number | null };
type Exchange = { question: string; answer: string; citations: Citation[]; insufficient?: boolean };

/** Tutor chat: whole-answer responses with server-verified citations; no raw HTML (spec 4.2). */
export function ChatPanel({ assignmentId, lessonId, initial }: { assignmentId: string; lessonId: string; initial: Exchange[] }) {
  const [items, setItems] = useState<Exchange[]>(initial);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; retry: string } | null>(null);

  async function ask(q: string) {
    setPending(true);
    setError(null);
    const res = await apiFetch<{ answer: string; citations: Citation[]; insufficient_context: boolean }>("/api/agents/tutor",
      { method: "POST", body: { assignmentId, lessonId, question: q } });
    setPending(false);
    if (!res.ok) { setError({ text: errorMessage(res.error), retry: q }); return; }
    setItems((all) => [...all, { question: q, answer: res.data.answer, citations: res.data.citations, insufficient: res.data.insufficient_context }]);
    setQuestion("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q) void ask(q);
  }

  return (
    <section aria-labelledby="tutor-title" className="flex flex-col gap-4">
      <div>
        <h2 id="tutor-title" className="text-base font-semibold">AI-тьютор</h2>
        <p className="text-xs text-muted-foreground">Отвечает только по материалам урока. Не меняет задания и оценку.</p>
      </div>
      <ol className="flex flex-col gap-4" aria-live="polite">
        {items.map((x, i) => (
          <li key={i} className="space-y-2">
            <p className="ml-auto max-w-[90%] rounded-xl bg-muted px-3 py-2 text-sm">{x.question}</p>
            <div className="rounded-xl border border-border p-3 text-sm">
              <SafeMarkdown>{x.answer}</SafeMarkdown>
              {x.insufficient ? <p className="mt-2 text-xs font-medium text-warning">В материалах урока недостаточно данных для полного ответа.</p> : null}
              {x.citations.length ? (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Источники ответа">
                  {x.citations.map((c) => (
                    <li key={c.source_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      <BookOpen className="size-3" aria-hidden />{c.title}{c.page ? `, стр. ${c.page}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {error ? (
        <Alert kind="error">{error.text} <button type="button" className="ml-1 underline" onClick={() => void ask(error.retry)}>Повторить</button></Alert>
      ) : null}
      <form onSubmit={submit} className="space-y-2">
        <TextArea label="Вопрос по уроку" maxChars={2000} value={question} disabled={pending}
          onChange={(e) => setQuestion(e.target.value)} className="min-h-24" />
        <Button type="submit" loading={pending} loadingText="Тьютор отвечает…" disabled={!question.trim() || question.length > 2000}
          icon={<Send className="size-4" aria-hidden />}>Спросить</Button>
        {pending ? <p className="text-xs text-muted-foreground">Отмена в интерфейсе не отменяет уже отправленный запрос.</p> : null}
      </form>
    </section>
  );
}
