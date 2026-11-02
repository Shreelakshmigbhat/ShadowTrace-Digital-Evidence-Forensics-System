import Link from "next/link";
import { getSession } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { CASE_STATUSES, SEVERITIES, listInvestigations, listLeadCandidates } from "@/lib/core-service";
import { cleanParams } from "@/lib/evidence-service";
import { buildQuery, fmtDate } from "@/lib/page-utils";
import { Card, CaseStatusBadge, ErrorBox, Highlight, NotLoggedIn, PageHeader, SeverityBadge, btnCls, btnGhostCls, inputCls } from "@/components/core/ui";

export const dynamic = "force-dynamic";

// Server component. The filter bar is a plain GET form, so it needs no client JavaScript.
// The search box runs a FULL-TEXT search (MATCH ... AGAINST) over case titles AND timeline descriptions;
// matching words are highlighted in the title.
export default async function InvestigationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;

  const params = cleanParams(searchParams);
  const leads = await listLeadCandidates();

  let result: Awaited<ReturnType<typeof listInvestigations>> | null = null;
  let error = "";
  try {
    result = await listInvestigations(params);
  } catch (e) {
    error = await errorText(e);
  }

  // Header cell that sorts by this column, flipping asc/desc when it is already the sort column.
  const SortHead = ({ col, label }: { col: string; label: string }) => {
    const active = params.sort === col;
    const nextOrder = active && (params.order ?? "desc") === "asc" ? "desc" : "asc";
    return (
      <th className="px-3 py-2 text-left font-semibold">
        <Link href={`/investigations${buildQuery(params, { sort: col, order: nextOrder, page: 1 })}`} className="hover:underline">
          {label}{active ? ((params.order ?? "desc") === "asc" ? " ▲" : " ▼") : ""}
        </Link>
      </th>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Investigations">
        {(session.role === "ADMIN" || session.role === "INVESTIGATOR") && <Link href="/investigations/new" className={btnCls}>+ New investigation</Link>}
      </PageHeader>

      <Card className="mb-4">
        <form method="get" action="/investigations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search cases and timeline…" className={`${inputCls} lg:col-span-2`} />
          <select name="status" defaultValue={params.status ?? ""} className={inputCls}>
            <option value="">All statuses</option>
            {CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="severity" defaultValue={params.severity ?? ""} className={inputCls}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="lead" defaultValue={params.lead ?? ""} className={inputCls}>
            <option value="">Any lead</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <button className={btnCls}>Search</button>
            <Link href="/investigations" className={btnGhostCls}>Reset</Link>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">Text search ignores words under 3 letters. A full case code such as CASE-2025-003 is looked up exactly.</p>
      </Card>

      {error && <ErrorBox message={error} />}

      {result && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <SortHead col="case_code" label="Case" />
                  <SortHead col="title" label="Title" />
                  <SortHead col="severity" label="Severity" />
                  <SortHead col="status" label="Status" />
                  <th className="px-3 py-2 text-left font-semibold">Lead</th>
                  <SortHead col="evidence" label="Evidence" />
                  <SortHead col="opened_at" label="Opened" />
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">{c.case_code}</td>
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/investigations/${c.id}`} className="text-blue-700 hover:underline"><Highlight text={c.title} query={result?.q} /></Link>
                      {result?.q && c.score !== undefined && Number(c.score) === 0 && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">matched in timeline</span>
                      )}
                    </td>
                    <td className="px-3 py-2"><SeverityBadge severity={c.severity} /></td>
                    <td className="px-3 py-2"><CaseStatusBadge status={c.status} /></td>
                    <td className="px-3 py-2">{c.lead_investigator}</td>
                    <td className="px-3 py-2">{c.evidence_count}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(c.opened_at).slice(0, 10)}</td>
                  </tr>
                ))}
                {result.items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No investigations match.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>{result.total} case(s) · page {result.page} of {Math.max(result.totalPages, 1)}</span>
            <div className="flex gap-2">
              {result.page > 1 && <Link className={btnGhostCls} href={`/investigations${buildQuery(params, { page: result.page - 1 })}`}>← Previous</Link>}
              {result.page < result.totalPages && <Link className={btnGhostCls} href={`/investigations${buildQuery(params, { page: result.page + 1 })}`}>Next →</Link>}
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}
