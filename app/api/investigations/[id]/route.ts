import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { getCaseDetail, SEVERITIES } from "@/lib/core-service";
import { addEvent, assertEligibleLead, lockCaseForChange } from "@/lib/case-access";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

// GET /api/investigations/:id -> case + timeline + evidence + assets (CALL get_case_summary, 4 result sets)
//                                + investigator notes from MongoDB (null if Mongo is down)
// DBMS concepts: stored procedure with multiple result sets, function case_duration_days, polyglot persistence.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const detail = await getCaseDetail(parse(idSchema, params.id));
    if (!detail) return fail("Investigation not found", 404);
    return ok(detail);
  } catch (e) {
    return handleError(e);
  }
}

const patchBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    severity: z.enum(SEVERITIES),
    // CLOSED is not allowed here: closing goes through POST .../close (a stored procedure with extra rules)
    status: z.enum(["OPEN", "ACTIVE", "ON_HOLD"]),
    lead_investigator_id: z.coerce.number().int().positive(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Send at least one field to change");

// PATCH /api/investigations/:id -> edit title / severity / status / lead (lead investigator or admin)
// DBMS concepts: transaction + SELECT ... FOR UPDATE, the AFTER UPDATE trigger writes the STATUS_CHANGED timeline
//                event, a closed case can only be reopened by an admin (then closed_at is cleared to satisfy the CHECKs).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(idSchema, params.id);
    const b = parse(patchBody, await readJson(req));

    const row = await withTransaction(session.userId, async (conn) => {
      const current = await lockCaseForChange(conn, id, session, { allowClosed: true });
      const isClosed = current.status === "CLOSED";
      if (isClosed && session.role !== "ADMIN") throw fail("This case is closed. An admin must reopen it first.", 409);
      if (isClosed && b.status === undefined) throw fail("A closed case can only be changed by reopening it (send a status)", 409);
      if (b.lead_investigator_id !== undefined && session.role !== "ADMIN")
        throw fail("Only an admin can reassign the lead investigator", 403);
      if (b.lead_investigator_id !== undefined) await assertEligibleLead(conn, b.lead_investigator_id);

      // Fixed SQL fragments only; every value is a "?" parameter.
      const sets: string[] = [];
      const values: (string | number)[] = [];
      if (b.title !== undefined) { sets.push("title = ?"); values.push(b.title); }
      if (b.severity !== undefined) { sets.push("severity = ?"); values.push(b.severity); }
      if (b.lead_investigator_id !== undefined) { sets.push("lead_investigator_id = ?"); values.push(b.lead_investigator_id); }
      if (b.status !== undefined) { sets.push("status = ?"); values.push(b.status); }
      if (isClosed && b.status !== undefined) sets.push("closed_at = NULL"); // reopening

      const [before] = await conn.execute("SELECT severity, title FROM investigations WHERE id = ?", [id]);
      const old = (before as { severity: string; title: string }[])[0];

      await conn.execute(`UPDATE investigations SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);

      // status changes are logged by the trigger; log the other edits ourselves
      if (b.severity !== undefined && b.severity !== old.severity)
        await addEvent(conn, id, "NOTE", `Severity changed from ${old.severity} to ${b.severity}`, session.userId);
      if (b.title !== undefined && b.title !== old.title)
        await addEvent(conn, id, "NOTE", `Title changed to "${b.title}"`, session.userId);
      if (b.lead_investigator_id !== undefined && b.lead_investigator_id !== current.lead_investigator_id)
        await addEvent(conn, id, "NOTE", "Lead investigator reassigned", session.userId);

      const [rows] = await conn.execute("SELECT * FROM v_case_overview WHERE id = ?", [id]);
      return (rows as unknown[])[0];
    });

    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
