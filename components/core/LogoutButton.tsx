"use client";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await callApi("POST", "/api/auth/logout");
    router.push("/login");
    router.refresh(); // drop cached server-rendered pages that belonged to the old session
  }
  return (
    <button onClick={logout} className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
      Log out
    </button>
  );
}
