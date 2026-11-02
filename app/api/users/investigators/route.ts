import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/users/investigators -> active investigators (id + name only) for the "lead investigator" picker.
// Open to ADMIN and INVESTIGATOR; the full user list stays admin-only.
export async function GET() {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR"]);
    const items = await query(
      `SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.role_name = 'INVESTIGATOR' AND u.is_active = TRUE ORDER BY u.full_name`
    );
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}
