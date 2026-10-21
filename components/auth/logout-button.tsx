"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Logout clears server session, client storage and in-memory state (spec 4.5). */
export function LogoutButton({ compact }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      try { sessionStorage.clear(); } catch { /* storage unavailable */ }
      try {
        for (const key of Object.keys(localStorage)) if (key !== "mschool-theme") localStorage.removeItem(key);
      } catch { /* storage unavailable */ }
      window.location.replace("/login");
    }
  }
  return (
    <Button variant="ghost" onClick={logout} loading={loading} icon={<LogOut className="size-4" aria-hidden />}
      aria-label={compact ? "Выйти" : undefined}>
      {compact ? <span className="sr-only">Выйти</span> : "Выйти"}
    </Button>
  );
}
