import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { getAssetWithCases } from "@/lib/core-service";
import { fmtDate } from "@/lib/page-utils";
import { Card, CaseStatusBadge, ErrorBox, NotLoggedIn, PageHeader, SeverityBadge } from "@/components/core/ui";

export const dynamic = "force-dynamic";

// One asset and every investigation it appears in (JOIN through investigation_assets).
// The same IP, account or wallet in several cases is how an investigator spots a connection between them.
export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) notFound();

  let result: Awaited<ReturnType<typeof getAssetWithCases>> = null;
  try {
    result = await getAssetWithCases(id);
  } catch (e) {
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorBox message={await errorText(e)} /></main>;
  }
  if (!result) notFound();
  const { asset, cases } = result;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title={asset.identifier}>
        <Link href="/assets" className="text-sm text-blue-700 hover:underline">← All assets</Link>
      </PageHeader>

      <Card title="Asset" className="mb-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Type</dt><dd>{asset.asset_type}</dd>
          <dt className="text-slate-500">Identifier</dt><dd className="font-mono">{asset.identifier}</dd>
          <dt className="text-slate-500">Description</dt><dd>{asset.description ?? "-"}</dd>
        </dl>
      </Card>

      <Card title={`Appears in ${cases.length} investigation(s)`}>
        {cases.length > 1 && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">This asset connects {cases.length} cases - worth a joint review.</p>}
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr><th className="py-1 pr-3">Case</th><th className="pr-3">Title</th><th className="pr-3">Severity</th><th className="pr-3">Status</th><th>Opened</th></tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 font-mono text-xs">{c.case_code}</td>
                <td className="pr-3"><Link href={`/investigations/${c.id}`} className="text-blue-700 hover:underline">{c.title}</Link></td>
                <td className="pr-3"><SeverityBadge severity={c.severity} /></td>
                <td className="pr-3"><CaseStatusBadge status={c.status} /></td>
                <td className="whitespace-nowrap">{fmtDate(c.opened_at).slice(0, 10)}</td>
              </tr>
            ))}
            {cases.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Not linked to any case yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
