"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, inputCls } from "@/components/evidence/ui";

// Registers a new asset in the shared register (investigator/admin). Duplicates are refused by UNIQUE(asset_type, identifier).
export default function AssetCreateForm() {
  const router = useRouter();
  const [type, setType] = useState("IP");
  const [identifier, setIdentifier] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await callApi("POST", "/api/assets", { asset_type: type, identifier, description: description || undefined });
    setBusy(false);
    if (res.error) return setError(res.error);
    setIdentifier(""); setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-5">
      <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
        {["IP", "DOMAIN", "DEVICE", "EMAIL", "ACCOUNT", "WALLET"].map((t) => <option key={t}>{t}</option>)}
      </select>
      <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Identifier (IP, domain, serial, …)" required minLength={2} className={`${inputCls} sm:col-span-2`} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className={inputCls} />
      <button disabled={busy} className={btnCls}>{busy ? "Adding…" : "Add asset"}</button>
      {error && <div className="sm:col-span-5"><ErrorBox message={error} /></div>}
    </form>
  );
}
