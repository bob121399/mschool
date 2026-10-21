/** Progress by required lessons of one assigned version (spec 4.2 ProgressBar). */
export function ProgressBar({ completed, total, label }: { completed: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{completed} из {total}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}
        aria-valuetext={`${completed} из ${total} уроков`} className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
