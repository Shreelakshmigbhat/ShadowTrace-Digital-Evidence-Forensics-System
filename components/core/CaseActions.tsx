"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, btnGhostCls, inputCls } from "@/components/evidence/ui";

// Edit / close / reopen controls for one case. Which buttons appear depends on the role and the case state,
// but the API and the close_investigation procedure are what actually enforce the rules.
export default function CaseActions({
  caseId, status, severity, leadId, isAdmin, canManage, leads,
}: {
  caseId: number; status: string; severity: string; leadId: number;
  isAdmin: boolean; canManage: boolean; leads: { id: number; full_name: string }[];
}) {
  const router = useRouter();
  const [newStatus, setNewStatus] = useState(status === "CLOSED" ? "ACTIVE" : status);
  const [newSeverity, setNewSeverity] = useState(severity);
  const [newLead, setNewLead] = useState(String(leadId));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = status === "CLOSED";

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError("");
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh(); // re-run the server component: new status, new timeline line
  }

  const save = () => run(() => callApi("PATCH", `/api/investigations/${caseId}`, {
    status: newStatus, severity: newSeverity,
    ...(isAdmin && Number(newLead) !== leadId ? { lead_investigator_id: Number(newLead) } : {}),
  }));
  const close = () => {
    if (!confirm("Close this case? This records a CASE_CLOSED event and freezes the case.")) return;
    return run(() => callApi("POST", `/api/investigations/${caseId}/close`));
  };
  const reopen = () => run(() => callApi("PATCH", `/api/investigations/${caseId}`, { status: newStatus }));

  if (closed && !isAdmin) return <p className="text-sm text-slate-500">This case is closed. Only an admin can reopen it.</p>;
  if (!canManage && !(closed && isAdmin)) return <p className="text-sm text-slate-500">Only the lead investigator or an admin can change this case.</p>;

  return (
    <div className="space-y-3">
      {closed ? (
        <div className="flex gap-2">
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={inputCls}>
            {["OPEN", "ACTIVE", "ON_HOLD"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={reopen} disabled={busy} className={btnCls}>Reopen</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={inputCls} aria-label="Status">
              {["OPEN", "ACTIVE", "ON_HOLD"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className={inputCls} aria-label="Severity">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {isAdmin && (
            <select value={newLead} onChange={(e) => setNewLead(e.target.value)} className={inputCls} aria-label="Lead investigator">
              {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={btnCls}>Save changes</button>
            <button onClick={close} disabled={busy} className={btnGhostCls}>Close case…</button>
          </div>
        </>
      )}
      {error && <ErrorBox message={error} />}
    </div>
  );
}
