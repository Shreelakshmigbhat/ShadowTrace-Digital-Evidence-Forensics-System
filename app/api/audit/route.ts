import { requireRole } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { listAudit } from "@/lib/evidence-service";

export const dynamic = "force-dynamic";

// GET /api/audit -> who did what, when (ADMIN only)
// DBMS concepts: audit trail filled by TRIGGERS (append-only table), LEFT JOIN to users
//                (user_id can be NULL), index idx_audit_target, date-range filter, role-based access.
export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    return ok(await listAudit(Object.fromEntries(new URL(req.url).searchParams)));
  } catch (e) {
    return handleError(e);
  }
}
