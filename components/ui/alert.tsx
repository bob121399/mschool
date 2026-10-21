import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

export type AlertKind = "info" | "success" | "warning" | "error";
const styles: Record<AlertKind, string> = {
  info: "border-border bg-muted",
  success: "border-success/50 bg-success/10",
  warning: "border-warning/50 bg-warning/10",
  error: "border-danger/60 bg-danger/10",
};
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

/** Inline status. Success is always icon + text, never color only (spec 4.1). */
export function Alert({ kind = "info", title, children, blocking }: {
  kind?: AlertKind; title?: string; children?: ReactNode; blocking?: boolean;
}) {
  const Icon = icons[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} aria-live={blocking ? "assertive" : "polite"}
      className={cn("flex gap-3 rounded-xl border p-4 text-sm", styles[kind])}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0",
        kind === "success" && "text-success-text", kind === "warning" && "text-warning", kind === "error" && "text-danger")} />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-foreground/90">{children}</div> : null}
      </div>
    </div>
  );
}
