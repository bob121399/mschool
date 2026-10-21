import Link from "next/link";
import { CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** locked: reason, no preview; in_progress: CTA; completed: check + «Завершено» + score (spec 4.2). */
export function LessonCard({ href, title, index, status, score, lockedReason }: {
  href: string; title: string; index: number; status: "locked" | "in_progress" | "completed"; score: number | null; lockedReason?: string;
}) {
  const body = (
    <div className={cn("flex min-h-16 items-center gap-4 rounded-xl border p-4",
      status === "in_progress" ? "border-foreground/40 bg-surface" : "border-border bg-surface",
      status === "locked" && "opacity-80")}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums" aria-hidden>{index}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {status === "locked" ? (
          <p className="text-sm text-muted-foreground">{lockedReason ?? "Откроется после прохождения предыдущего урока"}</p>
        ) : status === "completed" ? (
          <p className="text-sm text-success-text">Завершено{score !== null ? ` · ${score} баллов` : ""}</p>
        ) : <p className="text-sm text-muted-foreground">Доступен сейчас</p>}
      </div>
      {status === "locked" ? <Lock className="size-5 text-muted-foreground" aria-label="Закрыт" />
        : status === "completed" ? <CheckCircle2 className="size-5 text-success-text" aria-label="Завершено" />
        : <PlayCircle className="size-5" aria-hidden />}
    </div>
  );
  if (status === "locked") return <div aria-disabled="true">{body}</div>;
  return <Link href={href} className="block rounded-xl">{body}</Link>;
}
