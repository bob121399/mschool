import { Check } from "lucide-react";
import { cn } from "./cn";
import { GRADES, gradeLabel, type Grade } from "@/lib/i18n/labels";

/** Junior → Middle → Senior → Head. Future grades read-only; track completion never changes grade. */
export function GradeStepper({ current }: { current: Grade }) {
  const index = GRADES.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Грейд">
      {GRADES.map((g, i) => (
        <li key={g} aria-current={g === current ? "step" : undefined}
          className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
            g === current ? "border-foreground font-semibold" : "border-border text-muted-foreground")}>
          {i < index ? <Check className="size-3.5" aria-hidden /> : null}
          {gradeLabel(g)}
          {g === current ? <span className="sr-only"> — текущий грейд</span> : null}
        </li>
      ))}
    </ol>
  );
}
