"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// recharts draws in the browser, so this is a client component. It only receives plain arrays.
type Count = { label: string; value: number };
type Monthly = { month: string; opened: number; closed: number };

const SEVERITY_COLORS: Record<string, string> = { LOW: "#16a34a", MEDIUM: "#ca8a04", HIGH: "#ea580c", CRITICAL: "#dc2626" };
const STATUS_COLORS: Record<string, string> = { OPEN: "#2563eb", ACTIVE: "#4f46e5", ON_HOLD: "#d97706", CLOSED: "#64748b" };

function Panel({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {empty ? <p className="py-10 text-center text-sm text-slate-500">No data yet.</p> : <div className="h-60">{children}</div>}
    </section>
  );
}

function CountChart({ data, colors }: { data: Count[]; colors: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ right: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="value" name="Cases" radius={3}>
          {data.map((d) => <Cell key={d.label} fill={colors[d.label] ?? "#2563eb"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardCharts({ byStatus, bySeverity, monthly, notesPerMonth }: {
  byStatus: Count[]; bySeverity: Count[]; monthly: Monthly[]; notesPerMonth: Count[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Cases by status" empty={byStatus.length === 0}><CountChart data={byStatus} colors={STATUS_COLORS} /></Panel>
      <Panel title="Cases by severity" empty={bySeverity.length === 0}><CountChart data={bySeverity} colors={SEVERITY_COLORS} /></Panel>

      <Panel title="Cases opened and closed per month (summary table)" empty={monthly.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="opened" name="Opened" fill="#2563eb" radius={3} />
            <Bar dataKey="closed" name="Closed" fill="#64748b" radius={3} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Investigator notes per month (MongoDB)" empty={notesPerMonth.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={notesPerMonth} margin={{ right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" name="Notes" fill="#7c3aed" radius={3} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
