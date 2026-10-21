"use client";
import { useEffect } from "react";
import { apiFetch } from "@/lib/client/api";

/** Server-issued lesson session; engagement is recorded by the server after ≥30 s of visible time. */
export function EngagementTracker({ assignmentId, lessonId }: { assignmentId: string; lessonId: string }) {
  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;
    let visibleMs = 0;
    let last = Date.now();
    let sent = false;
    const tick = async () => {
      if (cancelled || sent || !token) return;
      const now = Date.now();
      if (document.visibilityState === "visible") visibleMs += now - last;
      last = now;
      if (visibleMs >= 31_000) {
        sent = true;
        await apiFetch("/api/me/lesson-session/engaged", { method: "POST", body: { token } });
      }
    };
    void apiFetch<{ token: string }>("/api/me/lesson-session", { method: "POST", body: { assignmentId, lessonId } }).then((r) => {
      if (r.ok) { token = r.data.token; last = Date.now(); }
    });
    const timer = setInterval(() => void tick(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [assignmentId, lessonId]);
  return null;
}
