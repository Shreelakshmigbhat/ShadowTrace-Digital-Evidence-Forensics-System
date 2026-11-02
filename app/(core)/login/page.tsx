import LoginForm from "@/components/core/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-blue-700">ShadowTrace</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Digital evidence forensics system. Sign in to continue.</p>
        <LoginForm next={searchParams.next} />
      </div>
    </main>
  );
}
