"use client";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

// Radix provides focus trap, Esc, focus return and aria wiring (spec 4.2 Modal/Dialog).
// Content stays mounted while open, so typed data is not lost on overlay interaction:
// clicks on the overlay do not close dialogs that hold a form (preventOutsideClose).
export function Dialog({ open, onOpenChange, title, description, children, footer, preventOutsideClose = true, wide }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string;
  children?: ReactNode; footer?: ReactNode; preventOutsideClose?: boolean; wide?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          onPointerDownOutside={preventOutsideClose ? (e) => e.preventDefault() : undefined}
          className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
            "overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">{description}</RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
                aria-label="Закрыть">
                <X className="size-5" aria-hidden />
              </button>
            </RadixDialog.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Destructive/important confirmation naming the object (spec 4.2). */
export function ConfirmDialog({ open, onOpenChange, title, objectName, consequence, confirmLabel, onConfirm, loading, destructive }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; objectName: string; consequence: string;
  confirmLabel: string; onConfirm: () => void; loading?: boolean; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={consequence}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Отмена</Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Объект: </span>
        <strong className="break-words">{objectName}</strong></p>
    </Dialog>
  );
}
