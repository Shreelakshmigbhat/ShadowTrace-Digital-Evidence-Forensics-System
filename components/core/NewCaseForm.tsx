"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, inputCls } from "@/components/evidence/ui";

// Opens a new case. Investigators lead their own cases; only an admin picks the lead.
export default function NewCaseForm({ isAdmin, leads }: { isAdmin: boolean; leads: { id: number; full_name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [lead, setLead] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await callApi<{ id: number }>("POST", "/api/investigations", {
      title, severity, lead_investigator_id: isAdmin ? Number(lead) : undefined,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push(`/investigations/${res.data!.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={200} required className={`${inputCls} mt-1`} placeholder="e.g. Unauthorised access to payroll server" />
      </label>
      <label className="block text-sm font-medium">
        Severity
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={`${inputCls} mt-1`}>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      {isAdmin && (
        <label className="block text-sm font-medium">
          Lead investigator
          <select value={lead} onChange={(e) => setLead(e.target.value)} required className={`${inputCls} mt-1`}>
            <option value="">Select…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
        </label>
      )}
      <p className="text-xs text-slate-500">The case code (CASE-YYYY-NNN) is assigned automatically.</p>
      {error && <ErrorBox message={error} />}
      <button disabled={busy} className={btnCls}>{busy ? "Creating…" : "Open case"}</button>
    </form>
  );
}
