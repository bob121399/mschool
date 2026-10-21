"use client";
import { useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** Tutor in a drawer-like dialog on mobile/tablet (spec 4.5). */
export function MobileTutor({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} icon={<MessageCircle className="size-4" aria-hidden />}>Спросить тьютора</Button>
      <Dialog open={open} onOpenChange={setOpen} title="AI-тьютор" wide preventOutsideClose={false}>{children}</Dialog>
    </>
  );
}
