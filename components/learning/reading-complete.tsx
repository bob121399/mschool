"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

/** «Завершить чтение» only for requires_assessment=false lessons. */
export function ReadingComplete({ assignmentId, lessonId, completed }: { assignmentId: string; lessonId: string; completed: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (completed) return <Alert kind="success">Чтение завершено.</Alert>;
  return (
    <div className="space-y-2">
      {error ? <Alert kind="error">{error}</Alert> : null}
      <Button loading={loading} onClick={async () => {
        setLoading(true);
        const r = await apiFetch("/api/me/reading-complete", { method: "POST", body: { assignmentId, lessonId } });
        setLoading(false);
        if (!r.ok) { setError(errorMessage(r.error)); return; }
        router.refresh();
      }}>Завершить чтение</Button>
    </div>
  );
}
