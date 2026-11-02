import Link from "next/link";
import { getSession } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { getDashboard } from "@/lib/core-service";
import { fmtDate } from "@/lib/page-utils";
import { Card, ErrorBox, KpiCard, NotLoggedIn, PageHeader } from "@/components/core/ui";
import DashboardCharts from "@/components/core/DashboardCharts";
import RefreshStatsButton from "@/components/core/RefreshStatsButton";

export const dynamic = "force-dynamic";

// Server component: every number comes from MySQL views/summary table or MongoDB aggregations.
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;

  let d: Awaited<ReturnType<typeof getDashboard>>;
  try {
    d = await getDashboard();
  } catch (e) {
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorBox message={await errorText(e)} /></main>;
  }

  const refreshedAt = d.monthly.length ? d.monthly.reduce((m: Date, r: any) => (r.refreshed_at > m ? r.refreshed_at : m), d.monthly[0].refreshed_at) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Dashboard">
        {session.role === "ADMIN" && <RefreshStatsButton />}
      </PageHeader>

      {!d.mongo && <div className="mb-4"><ErrorBox message="MongoDB is unreachable: note statistics are empty. Everything from MySQL is shown." /></div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open cases" value={d.totals.open_cases ?? 0} hint={`${d.totals.on_hold_cases ?? 0} on hold`} tone="blue" />
        <KpiCard label="Critical and open" value={d.totals.critical_open ?? 0} tone={d.totals.critical_open > 0 ? "red" : "slate"} />
        <KpiCard label="Closed cases" value={d.totals.closed_cases ?? 0} hint={`${d.totals.total_cases} in total`} tone="green" />
        <KpiCard label="Notes (MongoDB)" value={d.mongo ? d.mongo.totalNotes : "-"} />
        <KpiCard label="Evidence items" value={d.counts.evidence_items} hint={`${d.counts.unlinked_evidence} not linked to any case`} />
        <KpiCard label="Assets registered" value={d.counts.assets} />
      </div>

      <div className="mt-4">
        <DashboardCharts
          byStatus={(d.byStatus as any[]).map((r) => ({ label: r.status, value: Number(r.count) }))}
          bySeverity={(d.bySeverity as any[]).map((r) => ({ label: r.severity, value: Number(r.count) }))}
          monthly={(d.monthly as any[]).map((r) => ({ month: r.stat_month, opened: Number(r.cases_opened), closed: Number(r.cases_closed) }))}
          notesPerMonth={(d.mongo?.notesPerMonth ?? []).map((r: any) => ({ label: r.month, value: Number(r.notes) }))}
        />
        <p className="mt-1 text-xs text-slate-500">
          Monthly chart comes from the <code>monthly_case_stats</code> summary table{refreshedAt ? `, last refreshed ${fmtDate(refreshedAt)}` : " (not filled yet)"}.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Investigator workload (view)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr><th className="py-1 pr-3">Investigator</th><th className="pr-3">Open</th><th className="pr-3">High priority</th><th className="pr-3">On hold</th><th className="pr-3">Closed</th><th>Evidence held</th></tr>
              </thead>
              <tbody>
                {(d.workload as any[]).map((w) => (
                  <tr key={w.investigator_id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-medium">{w.full_name}</td>
                    <td className="pr-3">{w.open_cases}</td>
                    <td className="pr-3">{w.high_priority_open}</td>
                    <td className="pr-3">{w.on_hold_cases}</td>
                    <td className="pr-3">{w.closed_cases}</td>
                    <td>{w.evidence_in_custody}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Latest activity">
          <ul className="space-y-2 text-sm">
            {(d.recentEvents as any[]).map((ev) => (
              <li key={ev.id}>
                <Link href={`/investigations/${ev.investigation_id}`} className="font-medium text-blue-700 hover:underline">{ev.case_code}</Link>{" "}
                <span className="text-slate-700">{ev.description}</span>
                <span className="block text-xs text-slate-500">{ev.event_type.replace("_", " ")} · {fmtDate(ev.event_time)}</span>
              </li>
            ))}
            {d.recentEvents.length === 0 && <li className="text-slate-500">No activity yet.</li>}
          </ul>
        </Card>

        <Card title="Most-used note tags (MongoDB)">
          {d.mongo?.topTags.length ? (
            <div className="flex flex-wrap gap-2">
              {d.mongo.topTags.map((t: any) => (
                <span key={t.tag} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800">{t.tag} · {t.uses}</span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No tags yet.</p>}
        </Card>

        <Card title="Evidence mentioned most in notes (MongoDB)">
          {d.mongo?.mostMentionedEvidence.length ? (
            <ul className="space-y-1 text-sm">
              {d.mongo.mostMentionedEvidence.slice(0, 6).map((m: any) => (
                <li key={m.evidence_id}>
                  <Link href={`/evidence/${m.evidence_id}`} className="text-blue-700 hover:underline">Evidence #{m.evidence_id}</Link>
                  {" "}- {m.mentions} mention(s) in {m.cases} case(s)
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No mentions yet.</p>}
        </Card>
      </div>
    </main>
  );
}
