import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { addEvent, lockCaseForChange } from "@/lib/case-access";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

// POST /api/investigations/:id/evidence  { evidence_id } -> link an evidence item to the case
// DBMS concepts: many-to-many junction table with a composite PRIMARY KEY (the same pair cannot be stored twice),
//                transaction (link row + timeline event), row lock on the case, existence check before the FK.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(idSchema, params.id);
    const { evidence_id } = parse(z.object({ evidence_id: idSchema }), await readJson(req));

    await withTransaction(session.userId, async (conn) => {
      await lockCaseForChange(conn, id, session);
      const [ev] = await conn.execute("SELECT file_name FROM evidence WHERE id = ?", [evidence_id]);
      const evidence = (ev as { file_name: string }[])[0];
      if (!evidence) throw fail("Evidence not found", 404);

      await conn.execute("INSERT INTO evidence_investigations (evidence_id, investigation_id) VALUES (?, ?)", [evidence_id, id]);
      await addEvent(conn, id, "EVIDENCE_LINKED", `Linked evidence #${evidence_id} (${evidence.file_name})`, session.userId);
    });
    return ok({ evidence_id, investigation_id: id }, 201);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("This evidence is already linked to the case", 409);
    return handleError(e);
  }
}

// DELETE /api/investigations/:id/evidence?evidence_id=7 -> unlink (the evidence record itself is untouched)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(idSchema, params.id);
    const evidenceId = parse(idSchema, new URL(req.url).searchParams.get("evidence_id"));

    await withTransaction(session.userId, async (conn) => {
      await lockCaseForChange(conn, id, session);
      const [res] = await conn.execute(
        "DELETE FROM evidence_investigations WHERE evidence_id = ? AND investigation_id = ?", [evidenceId, id]);
      if ((res as { affectedRows: number }).affectedRows === 0) throw fail("That evidence is not linked to this case", 404);
      await addEvent(conn, id, "EVIDENCE_UNLINKED", `Unlinked evidence #${evidenceId}`, session.userId);
    });
    return ok({ unlinked: true });
  } catch (e) {
    return handleError(e);
  }
}
