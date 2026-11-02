import { getSession } from "@/lib/auth";
import { listLeadCandidates } from "@/lib/core-service";
import { Card, ErrorBox, NotLoggedIn, PageHeader } from "@/components/core/ui";
import NewCaseForm from "@/components/core/NewCaseForm";

export const dynamic = "force-dynamic";

export default async function NewInvestigationPage() {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;
  // Hiding the nav link is not enough: the page and POST /api/investigations both check the role too.
  if (session.role !== "ADMIN" && session.role !== "INVESTIGATOR")
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorBox message="Only investigators and admins can open cases." /></main>;

  const leads = session.role === "ADMIN" ? await listLeadCandidates() : [];
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Open a new investigation" />
      <Card className="max-w-2xl"><NewCaseForm isAdmin={session.role === "ADMIN"} leads={leads} /></Card>
    </main>
  );
}
