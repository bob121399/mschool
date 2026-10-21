"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { jobStatusLabels } from "@/lib/i18n/labels";

type Job = { id: string; status: string; attempts: number; last_error_code: string | null; next_action: string; result: { course_id?: string } | null };

/** Polls a durable job; the user can leave and come back (spec 4.2 Upload/JobStatus). */
export function JobStatus({ jobId, onFinished }: { jobId: string; onFinished?: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await apiFetch<Job>(`/api/hr/jobs/${jobId}`);
      if (stop) return;
      if (r.ok) {
        setJob(r.data);
        if (["succeeded", "failed", "needs_review"].includes(r.data.status)) { onFinished?.(); return; }
      }
      setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [jobId, onFinished]);
  if (!job) return <p className="text-sm text-muted-foreground" role="status">Проверяем статус задачи…</p>;
  return (
    <div className="space-y-1 text-sm" role="status" aria-live="polite">
      <Badge tone={job.status === "failed" ? "danger" : job.status === "needs_review" || job.status === "succeeded" ? "success" : "neutral"}>
        {jobStatusLabels[job.status] ?? job.status}</Badge>
      <p className="text-muted-foreground">{job.next_action}{job.attempts > 1 ? ` Попытка ${job.attempts}.` : ""}</p>
      {job.result?.course_id ? <Link className="underline" href={`/hr/courses/${job.result.course_id}/edit`}>Открыть черновик</Link> : null}
    </div>
  );
}
