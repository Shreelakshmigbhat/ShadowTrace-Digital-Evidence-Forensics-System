import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { errorText } from "@/lib/api";
import { getCaseDetail, listLeadCandidates } from "@/lib/core-service";
import { fmtDate } from "@/lib/page-utils";
import { Card, CaseStatusBadge, ErrorBox, NotLoggedIn, PageHeader, SeverityBadge, StatusBadgeFromEvidence } from "@/components/core/ui";
import CaseActions from "@/components/core/CaseActions";
import { AssetLinker, EvidenceLinker, UnlinkButton } from "@/components/core/LinkPanels";
import NotesPanel from "@/components/core/NotesPanel";

export const dynamic = "force-dynamic";

const EVENT_DOT: Record<string, string> = {
  OPENED: "bg-green-500", CASE_CLOSED: "bg-slate-800", STATUS_CHANGED: "bg-amber-500",
  EVIDENCE_LINKED: "bg-blue-500", EVIDENCE_UNLINKED: "bg-blue-300", ASSET_LINKED: "bg-violet-500",
  ASSET_UNLINKED: "bg-violet-300", NOTE: "bg-slate-400",
};

// Server component: the case, timeline, evidence and assets come from ONE stored procedure call
// (get_case_summary returns 4 result sets); the notes come from MongoDB.
export default async function InvestigationDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) notFound();

  let detail: Awaited<ReturnType<typeof getCaseDetail>> = null;
  try {
    detail = await getCaseDetail(id);
  } catch (e) {
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorBox message={await errorText(e)} /></main>;
  }
  if (!detail) notFound();
  const { case: c, events, evidence, assets, notes } = detail;

  const isAdmin = session.role === "ADMIN";
  const isLead = c.lead_investigator_id === session.userId;
  const closed = c.status === "CLOSED";
  // UI-only switches. The API (lockCaseForChange + the close_investigation procedure) is what actually enforces these.
  const canManage = !closed && (isAdmin || isLead);
  const leads = isAdmin ? await listLeadCandidates() : [];

  // Choices for the link forms: everything not already linked.
  const linkedEvidence = new Set(evidence.map((e) => e.id));
  const linkedAssets = new Set(assets.map((a) => a.id));
  const evidenceOptions = canManage
    ? (await query<{ id: number; file_name: string }>("SELECT id, file_name FROM evidence ORDER BY id")).filter((e) => !linkedEvidence.has(e.id))
    : [];
  const assetOptions = canManage
    ? (await query<{ id: number; asset_type: string; identifier: string }>("SELECT id, asset_type, identifier FROM assets ORDER BY asset_type, identifier")).filter((a) => !linkedAssets.has(a.id))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title={c.title}>
        <Link href="/investigations" className="text-sm text-blue-700 hover:underline">← All investigations</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Overview" className="lg:col-span-2">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">Case code</dt><dd className="font-mono">{c.case_code}</dd>
            <dt className="text-slate-500">Severity</dt><dd><SeverityBadge severity={c.severity} /></dd>
            <dt className="text-slate-500">Status</dt><dd><CaseStatusBadge status={c.status} /></dd>
            <dt className="text-slate-500">Lead investigator</dt><dd className="font-medium">{c.lead_investigator}</dd>
            <dt className="text-slate-500">Opened</dt><dd>{fmtDate(c.opened_at)}</dd>
            {c.closed_at && (<><dt className="text-slate-500">Closed</dt><dd>{fmtDate(c.closed_at)}</dd></>)}
            <dt className="text-slate-500">{closed ? "Duration" : "Open for"}</dt><dd>{c.days_open} day(s)</dd>
            <dt className="text-slate-500">Linked</dt><dd>{c.evidence_count} evidence · {c.asset_count} assets · {c.event_count} events</dd>
          </dl>
        </Card>

        <Card title="Actions">
          <CaseActions caseId={c.id} status={c.status} severity={c.severity} leadId={c.lead_investigator_id}
            isAdmin={isAdmin} canManage={canManage} leads={leads} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Linked evidence (${evidence.length})`}>
          {evidence.length === 0 ? <p className="text-sm text-slate-500">No evidence linked yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {evidence.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                  <div>
                    <Link href={`/evidence/${e.id}`} className="font-medium text-blue-700 hover:underline">{e.file_name}</Link>
                    <p className="text-xs text-slate-500">{e.type_name} · held by {e.custodian_name} · <StatusBadgeFromEvidence status={e.status} /></p>
                  </div>
                  {canManage && <UnlinkButton url={`/api/investigations/${c.id}/evidence?evidence_id=${e.id}`} label={e.file_name} />}
                </li>
              ))}
            </ul>
          )}
          {canManage && <EvidenceLinker caseId={c.id} options={evidenceOptions} />}
        </Card>

        <Card title={`Assets (${assets.length})`}>
          {assets.length === 0 ? <p className="text-sm text-slate-500">No assets linked yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {assets.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                  <div>
                    <Link href={`/assets/${a.id}`} className="font-medium text-blue-700 hover:underline">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{a.asset_type}</span>{a.identifier}
                    </Link>
                    {a.description && <p className="text-xs text-slate-500">{a.description}</p>}
                  </div>
                  {canManage && <UnlinkButton url={`/api/investigations/${c.id}/assets?asset_id=${a.id}`} label={a.identifier} />}
                </li>
              ))}
            </ul>
          )}
          {canManage && <AssetLinker caseId={c.id} options={assetOptions} />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Timeline (newest first)">
          <ol className="relative ml-2 border-l-2 border-slate-200">
            {events.map((ev) => (
              <li key={ev.id} className="mb-4 ml-4">
                <span className={`absolute -left-[7px] h-3 w-3 rounded-full border-2 border-white ${EVENT_DOT[ev.event_type] ?? "bg-slate-400"}`} />
                <p className="text-sm font-medium">{ev.description}</p>
                <p className="text-xs text-slate-500">{ev.event_type.replace("_", " ")} · {fmtDate(ev.event_time)}{ev.created_by_name ? ` · ${ev.created_by_name}` : ""}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Investigator notes (MongoDB)">
          <NotesPanel caseId={c.id} notes={notes} userId={session.userId} role={session.role} />
        </Card>
      </div>
    </main>
  );
}
