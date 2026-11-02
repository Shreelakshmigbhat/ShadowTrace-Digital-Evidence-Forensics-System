import Link from "next/link";
import { getSession } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { ASSET_TYPES, listAssets } from "@/lib/core-service";
import { cleanParams } from "@/lib/evidence-service";
import { buildQuery } from "@/lib/page-utils";
import { Card, ErrorBox, NotLoggedIn, PageHeader, btnCls, btnGhostCls, inputCls } from "@/components/core/ui";
import AssetCreateForm from "@/components/core/AssetCreateForm";

export const dynamic = "force-dynamic";

// The asset register: IPs, domains, devices, accounts... shared between cases.
// "Shared only" keeps assets that appear in 2+ cases: those are the links between investigations.
export default async function AssetsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;
  const canWrite = session.role === "ADMIN" || session.role === "INVESTIGATOR";

  const params = cleanParams(searchParams);
  let result: Awaited<ReturnType<typeof listAssets>> | null = null;
  let error = "";
  try {
    result = await listAssets(params);
  } catch (e) {
    error = await errorText(e);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Assets" />

      <Card className="mb-4">
        <form method="get" action="/assets" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search identifier or description…" className={`${inputCls} lg:col-span-2`} />
          <select name="type" defaultValue={params.type ?? ""} className={inputCls}>
            <option value="">All types</option>
            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" value="true" defaultChecked={params.shared === "true"} /> In 2+ cases only
          </label>
          <div className="flex gap-2">
            <button className={btnCls}>Filter</button>
            <Link href="/assets" className={btnGhostCls}>Reset</Link>
          </div>
        </form>
      </Card>

      {canWrite && <Card title="Register a new asset" className="mb-4"><AssetCreateForm /></Card>}

      {error && <ErrorBox message={error} />}
      {result && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Identifier</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Cases</th></tr>
              </thead>
              <tbody>
                {result.items.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{a.asset_type}</span></td>
                    <td className="px-3 py-2 font-medium"><Link href={`/assets/${a.id}`} className="text-blue-700 hover:underline">{a.identifier}</Link></td>
                    <td className="px-3 py-2 text-slate-600">{a.description}</td>
                    <td className="px-3 py-2">
                      <span className={Number(a.cases_count) > 1 ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800" : ""}>{a.cases_count}</span>
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">No assets match.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>{result.total} asset(s) · page {result.page} of {Math.max(result.totalPages, 1)}</span>
            <div className="flex gap-2">
              {result.page > 1 && <Link className={btnGhostCls} href={`/assets${buildQuery(params, { page: result.page - 1 })}`}>← Previous</Link>}
              {result.page < result.totalPages && <Link className={btnGhostCls} href={`/assets${buildQuery(params, { page: result.page + 1 })}`}>Next →</Link>}
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}
