"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, inputCls } from "@/components/evidence/ui";

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await callApi("POST", "/api/auth/login", { email, password });
    setBusy(false);
    if (res.error) return setError(res.error); // the server's message is intentionally generic
    // Only follow "next" if it is a path on this site ("//evil.com" would be an open redirect).
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    router.push(target);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className={`${inputCls} mt-1`} />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputCls} mt-1`} />
      </label>
      {error && <ErrorBox message={error} />}
      <button disabled={busy} className={`${btnCls} w-full justify-center`}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
