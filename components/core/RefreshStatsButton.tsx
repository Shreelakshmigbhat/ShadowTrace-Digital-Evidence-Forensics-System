"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { btnGhostCls } from "@/components/evidence/ui";

// Admin-only: rebuilds the monthly_case_stats summary table now (POST /api/dashboard -> CALL refresh_monthly_case_stats).
export default function RefreshStatsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true);
    setError("");
    const res = await callApi("POST", "/api/dashboard");
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={refresh} disabled={busy} className={btnGhostCls}>{busy ? "Refreshing…" : "Refresh summary"}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
