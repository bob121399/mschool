"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "./cn";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; text: string };
const ToastContext = createContext<{ show: (kind: ToastKind, text: string) => void } | null>(null);

// Short statuses only; important errors stay inline (spec 4.2 Toast/Alert). aria-live polite.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((kind: ToastKind, text: string) => {
    counter.current += 1;
    const id = counter.current;
    setItems((all) => [...all.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertTriangle : Info;
          return (
            <div key={t.id} role="status"
              className={cn("pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3 text-sm shadow-lg",
                t.kind === "error" ? "border-danger" : "border-border")}>
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.kind === "success" && "text-success-text",
                t.kind === "error" && "text-danger")} aria-hidden />
              <p className="flex-1">{t.text}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Скрыть уведомление"
                className="-m-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-muted">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
