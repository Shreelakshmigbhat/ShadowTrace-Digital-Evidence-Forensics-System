"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import { ErrorBox, btnCls, btnGhostCls, inputCls } from "@/components/evidence/ui";

type UserRow = { id: number; full_name: string; email: string; is_active: number; created_at: string; role_name: string };

// Admin user management. Every change goes through /api/users, which hashes passwords with bcrypt, forbids
// self-lockout, and refuses to remove the last active admin. Passwords are never displayed or returned.
export default function UsersAdmin({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "ANALYST" });
  const [busy, setBusy] = useState(false);

  async function patch(id: number, body: Record<string, unknown>) {
    setError("");
    const res = await callApi("PATCH", `/api/users/${id}`, body);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await callApi("POST", "/api/users", form);
    setBusy(false);
    if (res.error) return setError(res.error);
    setForm({ full_name: "", email: "", password: "", role: "ANALYST" });
    router.refresh();
  }

  function resetPassword(u: UserRow) {
    const pw = prompt(`New password for ${u.full_name}\n(8-72 characters with upper, lower, digit and symbol)`);
    if (pw) patch(u.id, { password: pw });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="grid gap-2 rounded bg-slate-50 p-3 sm:grid-cols-5">
        <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" required minLength={2} className={inputCls} />
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required className={inputCls} />
        <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Initial password" required className={inputCls} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
          {["ADMIN", "INVESTIGATOR", "ANALYST"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <button disabled={busy} className={btnCls}>{busy ? "Creating…" : "Create user"}</button>
        <p className="text-xs text-slate-500 sm:col-span-5">Password policy: 8-72 characters with an uppercase letter, a lowercase letter, a digit and a symbol.</p>
      </form>

      {error && <ErrorBox message={error} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Active</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-500">{u.id}</td>
                <td className="px-3 py-2 font-medium">{u.full_name}{u.id === currentUserId && <span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                <td className="px-3 py-2 text-slate-600">{u.email}</td>
                <td className="px-3 py-2">
                  <select value={u.role_name} onChange={(e) => patch(u.id, { role: e.target.value })} className={`${inputCls} w-40`} aria-label={`Role of ${u.full_name}`}>
                    {["ADMIN", "INVESTIGATOR", "ANALYST"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={!!u.is_active} onChange={(e) => patch(u.id, { is_active: e.target.checked })} aria-label={`Active: ${u.full_name}`} />
                </td>
                <td className="px-3 py-2"><button onClick={() => resetPassword(u)} className={btnGhostCls}>Reset password</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
