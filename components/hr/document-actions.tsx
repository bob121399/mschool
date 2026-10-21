"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function ReprocessButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="secondary" loading={loading} onClick={async () => {
        setLoading(true);
        const r = await apiFetch(`/api/hr/documents/${documentId}/process`, { method: "POST", body: {} });
        setLoading(false);
        if (!r.ok) setError(errorMessage(r.error)); else router.refresh();
      }}>Запустить обработку</Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export function ApproveSource({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <Button onClick={() => setOpen(true)}>Подтвердить источник</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Подтвердить источник" objectName={title}
        consequence="Я проверил(а) извлеченный текст. После подтверждения источник станет неизменяемым и доступен методисту и урокам."
        confirmLabel="Подтверждаю" loading={loading} onConfirm={async () => {
          setLoading(true);
          const r = await apiFetch(`/api/hr/documents/${documentId}/approve`, { method: "POST", body: { confirmPreview: true } });
          setLoading(false);
          setOpen(false);
          if (!r.ok) setError(errorMessage(r.error)); else { toast.show("success", "Источник подтвержден"); router.refresh(); }
        }} />
    </>
  );
}
