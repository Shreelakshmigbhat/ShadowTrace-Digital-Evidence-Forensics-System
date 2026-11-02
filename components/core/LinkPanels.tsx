"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, btnGhostCls, inputCls } from "@/components/evidence/ui";

// Small client pieces for linking/unlinking evidence and assets on a case page.
// The tables themselves are rendered by the server page; these only send the changes to the API.

export function UnlinkButton({ url, label }: { url: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function unlink() {
    if (!confirm(`Unlink ${label} from this case? The record itself is not deleted.`)) return;
    setBusy(true);
    const res = await callApi("DELETE", url);
    setBusy(false);
    if (res.error) return alert(res.error);
    router.refresh();
  }
  return <button onClick={unlink} disabled={busy} className="text-xs text-red-700 hover:underline">Unlink</button>;
}

export function EvidenceLinker({ caseId, options }: { caseId: number; options: { id: number; file_name: string }[] }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await callApi("POST", `/api/investigations/${caseId}/evidence`, { evidence_id: Number(id) });
    setBusy(false);
    if (res.error) return setError(res.error);
    setId("");
    router.refresh();
  }
  return (
    <form onSubmit={link} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <select value={id} onChange={(e) => setId(e.target.value)} className={inputCls} required>
          <option value="">Link evidence…</option>
          {options.map((o) => <option key={o.id} value={o.id}>#{o.id} - {o.file_name}</option>)}
        </select>
        <button disabled={busy || !id} className={btnCls}>Link</button>
      </div>
      {error && <ErrorBox message={error} />}
    </form>
  );
}

export function AssetLinker({ caseId, options }: { caseId: number; options: { id: number; asset_type: string; identifier: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [assetId, setAssetId] = useState("");
  const [type, setType] = useState("IP");
  const [identifier, setIdentifier] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = mode === "existing"
      ? { asset_id: Number(assetId) }
      : { asset_type: type, identifier, description: description || undefined };
    const res = await callApi("POST", `/api/investigations/${caseId}/assets`, body);
    setBusy(false);
    if (res.error) return setError(res.error);
    setAssetId(""); setIdentifier(""); setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={link} className="mt-3 space-y-2">
      <div className="flex gap-3 text-xs">
        <label><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing asset</label>
        <label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New asset</label>
      </div>
      {mode === "existing" ? (
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inputCls} required>
          <option value="">Choose an asset…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.asset_type} · {o.identifier}</option>)}
        </select>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {["IP", "DOMAIN", "DEVICE", "EMAIL", "ACCOUNT", "WALLET"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Identifier" required minLength={2} className={`${inputCls} col-span-2`} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className={`${inputCls} col-span-3`} />
        </div>
      )}
      <button disabled={busy} className={btnGhostCls}>{busy ? "Linking…" : "Link asset"}</button>
      {error && <ErrorBox message={error} />}
    </form>
  );
}
