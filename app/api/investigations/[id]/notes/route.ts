import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getDb } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { listNotes } from "@/lib/core-service";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

const noteBody = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  evidence_ids: z.array(idSchema).max(100).default([]),
  // Metadata only: we store the name/size/kind of an attachment, not the file.
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    size_kb: z.number().min(0).optional(),
    kind: z.string().trim().max(50).optional(),
  })).max(20).default([]),
});

// GET /api/investigations/:id/notes -> the case's notes, newest first (MongoDB)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const id = parse(idSchema, params.id);
    const [c] = await query("SELECT id FROM investigations WHERE id = ?", [id]);
    if (!c) return fail("Investigation not found", 404);
    const notes = await listNotes(id);
    if (notes === null) return fail("Notes database is unavailable", 503);
    return ok(notes);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/investigations/:id/notes -> add a note (any logged-in role)
// DBMS concepts: MongoDB insert with $jsonSchema validation, cross-database checks (the case and every mentioned
//                evidence id must exist in MySQL because Mongo has no foreign keys), audit row in MySQL.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const id = parse(idSchema, params.id);
    const b = parse(noteBody, await readJson(req));

    const [c] = await query("SELECT id FROM investigations WHERE id = ?", [id]);
    if (!c) return fail("Investigation not found", 404);

    const evidenceIds = [...new Set(b.evidence_ids)];
    if (evidenceIds.length) {
      const found = await query(`SELECT id FROM evidence WHERE id IN (${evidenceIds.map(() => "?").join(",")})`, evidenceIds);
      if (found.length !== evidenceIds.length) return fail("One or more mentioned evidence ids do not exist", 400);
    }

    const now = new Date();
    const doc: Record<string, unknown> = {
      investigation_id: id,
      author_id: session.userId,
      body: b.body,
      tags: b.tags,
      evidence_ids: evidenceIds,
      attachments: b.attachments,
      created_at: now,
      updated_at: now,
      edit_history: [],
    };
    if (b.title) doc.title = b.title; // undefined would be stored as null, which the validator rejects

    const col = (await getDb()).collection("case_notes");
    const res = await col.insertOne(doc);

    await withTransaction(session.userId, (conn) =>
      conn.execute("INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('case_notes', ?, 'INSERT', ?)", [id, session.userId]));

    return ok({ id: String(res.insertedId), ...doc, author_name: session.name }, 201);
  } catch (e) {
    return handleError(e);
  }
}
