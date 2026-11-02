import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { Card, ErrorBox, NotLoggedIn, PageHeader } from "@/components/core/ui";
import UsersAdmin from "@/components/core/UsersAdmin";

export const dynamic = "force-dynamic";

// Admin only. The user list is read here (never including password_hash) and handed to a client component
// that calls /api/users for every change.
export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) return <NotLoggedIn />;
  if (session.role !== "ADMIN")
    return <main className="mx-auto max-w-6xl px-4 py-6"><ErrorBox message="User management is for administrators only." /></main>;

  const users = await query(
    `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, r.role_name
     FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id`);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Users" />
      <Card><UsersAdmin users={JSON.parse(JSON.stringify(users))} currentUserId={session.userId} /></Card>
    </main>
  );
}
