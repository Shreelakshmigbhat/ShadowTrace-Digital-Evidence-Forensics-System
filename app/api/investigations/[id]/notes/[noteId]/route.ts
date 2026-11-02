import { z } from "zod";
import { ObjectId } from "mongodb";
import { query, withTransaction } from "@/lib/db";
import { getDb } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();
const noteIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, "invalid note id");

const patchBody = z
  .object({
    title: z.string().trim().max(200),
    body: z.string().trim().min(1).max(20000),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    evidence_ids: z.array(idSchema).max(100),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Send at least one field to change");

// PATCH /api/investigations/:id/notes/:noteId -> edit a note (its author or an admin)
// DBMS concepts: MongoDB update with an EMBEDDED EDIT HISTORY: when the body changes, the old text is pushed into
//                edit_history in the same atomic single-document update, so history can never be lost or skipped.
export async function PATCH(req: Request, { params }: { params: { id: string; noteId: string } }) {
  try {
    const session = await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const id = parse(idSchema, params.id);
    const _id = new ObjectId(parse(noteIdSchema, params.noteId));
    const b = parse(patchBody, await readJson(req));

    const col = (await getDb()).collection("case_notes");
    const existing = await col.findOne({ _id, investigation_id: id });
    if (!existing) return fail("Note not found", 404);
    if (session.role !== "ADMIN" && existing.author_id !== session.userId) return fail("You can only edit your own notes", 403);

    if (b.evidence_ids?.length) {
      const ids = [...new Set(b.evidence_ids)];
      const found = await query(`SELECT id FROM evidence WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      if (found.length !== ids.length) return fail("One or more mentioned evidence ids do not exist", 400);
      b.evidence_ids = ids;
    }

    const now = new Date();
    const $set: Record<string, unknown> = { updated_at: now };
    if (b.title !== undefined) $set.title = b.title;
    if (b.body !== undefined) $set.body = b.body;
    if (b.tags !== undefined) $set.tags = b.tags;
    if (b.evidence_ids !== undefined) $set.evidence_ids = b.evidence_ids;

    const update: Record<string, unknown> = { $set };
    if (b.body !== undefined && b.body !== existing.body)
      update.$push = { edit_history: { edited_at: now, edited_by: session.userId, previous_body: existing.body } };

    await col.updateOne({ _id }, update);

    await withTransaction(session.userId, (conn) =>
      conn.execute("INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('case_notes', ?, 'UPDATE', ?)", [id, session.userId]));

    const saved = await col.findOne({ _id });
    return ok(JSON.parse(JSON.stringify({ ...saved, id: String(_id), _id: undefined })));
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/investigations/:id/notes/:noteId -> delete a note. ANALYSTs cannot delete (role rule);
// an investigator may delete only their own notes, an admin any.
export async function DELETE(_req: Request, { params }: { params: { id: string; noteId: string } }) {
  try {
    const session = await requireRole(["ADMIN", "INVESTIGATOR"]);
    const id = parse(idSchema, params.id);
    const _id = new ObjectId(parse(noteIdSchema, params.noteId));

    const col = (await getDb()).collection("case_notes");
    const existing = await col.findOne({ _id, investigation_id: id });
    if (!existing) return fail("Note not found", 404);
    if (session.role !== "ADMIN" && existing.author_id !== session.userId) return fail("You can only delete your own notes", 403);

    await col.deleteOne({ _id });
    await withTransaction(session.userId, (conn) =>
      conn.execute("INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('case_notes', ?, 'DELETE', ?)", [id, session.userId]));
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
