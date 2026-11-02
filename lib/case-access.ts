import type { PoolConnection } from "mysql2/promise";
import type { Session } from "@/lib/auth";
import { fail } from "@/lib/api";

export type LockedCase = { id: number; status: string; lead_investigator_id: number; case_code: string };

// Inside a transaction: lock the case row (SELECT ... FOR UPDATE) and check that this user may change it.
//   - the lead investigator or an ADMIN may change a case
//   - a CLOSED case is frozen unless allowClosed is set (only the edit/reopen path sets it)
// Throws a ready-made error Response (404/403/409) that handleError() passes straight through.
export async function lockCaseForChange(
  conn: PoolConnection, caseId: number, session: Session, opts: { allowClosed?: boolean } = {}
): Promise<LockedCase> {
  const [rows] = await conn.execute(
    "SELECT id, status, lead_investigator_id, case_code FROM investigations WHERE id = ? FOR UPDATE", [caseId]);
  const row = (rows as LockedCase[])[0];
  if (!row) throw fail("Investigation not found", 404);
  if (session.role !== "ADMIN" && row.lead_investigator_id !== session.userId)
    throw fail("Only the lead investigator or an admin can change this case", 403);
  if (row.status === "CLOSED" && !opts.allowClosed) throw fail("This case is closed. An admin must reopen it first.", 409);
  return row;
}

// A lead must be an active INVESTIGATOR (or an ADMIN).
export async function assertEligibleLead(conn: PoolConnection, userId: number) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.is_active = TRUE AND r.role_name IN ('INVESTIGATOR', 'ADMIN')`, [userId]);
  if ((rows as unknown[]).length === 0) throw fail("The lead investigator must be an active investigator", 400);
}

// Adds a line to the case timeline. created_by is the acting user.
export async function addEvent(conn: PoolConnection, caseId: number, type: string, description: string, userId: number) {
  await conn.execute(
    "INSERT INTO investigation_events (investigation_id, event_type, description, created_by) VALUES (?, ?, ?, ?)",
    [caseId, type, description.slice(0, 500), userId]
  );
}
