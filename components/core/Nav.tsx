import Link from "next/link";
import type { Session } from "@/lib/auth";
import LogoutButton from "@/components/core/LogoutButton";

// Shared navigation for every page after login. Links are hidden when the role cannot use them;
// that is only convenience - every page and API route still checks the role itself.
export default function Nav({ session }: { session: Session }) {
  const role = session.role;
  const canWrite = role === "ADMIN" || role === "INVESTIGATOR";
  const link = "rounded px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200";
  const group = "mr-1 hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:inline";

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2">
        <span className="mr-3 font-bold text-blue-700">ShadowTrace</span>

        <span className={group}>Cases</span>
        <Link href="/dashboard" className={link}>Dashboard</Link>
        <Link href="/investigations" className={link}>Investigations</Link>
        {canWrite && <Link href="/investigations/new" className={link}>New case</Link>}
        <Link href="/assets" className={link}>Assets</Link>

        <span className={`${group} ml-2`}>Evidence</span>
        <Link href="/evidence" className={link}>Evidence</Link>
        {canWrite && <Link href="/evidence/new" className={link}>Add evidence</Link>}
        <Link href="/evidence/verify" className={link}>Verify hash</Link>
        <Link href="/evidence/stats" className={link}>Statistics</Link>

        {role === "ADMIN" && (
          <>
            <span className={`${group} ml-2`}>Admin</span>
            <Link href="/admin/users" className={link}>Users</Link>
            <Link href="/audit" className={link}>Audit log</Link>
          </>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>{session.name} · {role}</span>
          <LogoutButton />
        </span>
      </nav>
    </header>
  );
}
