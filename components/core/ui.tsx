// Small presentational pieces for the investigation pages (no state, so usable from server components).
// Buttons, inputs, cards and headers are shared with Member A's pages (components/evidence/ui.tsx).
import type { ReactNode } from "react";
export { Card, PageHeader, ErrorBox, NotLoggedIn, inputCls, btnCls, btnGhostCls } from "@/components/evidence/ui";

const SEVERITY_STYLES: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};
const CASE_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-indigo-100 text-indigo-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
  CLOSED: "bg-slate-200 text-slate-700",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[severity] ?? "bg-slate-100"}`}>{severity}</span>;
}

export function CaseStatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CASE_STATUS_STYLES[status] ?? "bg-slate-100"}`}>{status.replace("_", " ")}</span>;
}

export function KpiCard({ label, value, hint, tone = "slate" }: { label: string; value: ReactNode; hint?: string; tone?: "slate" | "red" | "green" | "blue" }) {
  const tones = { slate: "text-slate-900", red: "text-red-700", green: "text-green-700", blue: "text-blue-700" };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// Wraps the words of a search query found in `text` in <mark>, so full-text matches are easy to spot.
// Words under 2 characters are ignored; regex special characters in the query are escaped first.
export function Highlight({ text, query }: { text: string; query?: string | null }) {
  const words = (query ?? "").split(/\s+/).filter((w) => w.length >= 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">{p}</mark> : <span key={i}>{p}</span>
      )}
    </>
  );
}
