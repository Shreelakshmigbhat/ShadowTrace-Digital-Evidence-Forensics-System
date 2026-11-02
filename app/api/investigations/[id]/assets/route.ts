import { z } from "zod";
import type { ResultSetHeader } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { addEvent, lockCaseForChange } from "@/lib/case-access";
import { ASSET_TYPES } from "@/lib/core-service";

export const dynamic = "force-dynamic";

const idSchema = z.coerce.number().int().positive();

// Link an EXISTING asset ({ asset_id }) or describe a NEW one ({ asset_type, identifier, description? }).
// If the new one already exists (same type + identifier) the existing asset is reused, so assets stay shared across cases.
const linkBody = z.union([
  z.object({ asset_id: idSchema }),
  z.object({
    asset_type: z.enum(ASSET_TYPES),
    identifier: z.string().trim().min(2).max(255),
    description: z.string().trim().max(255).optional(),
  }),
]);

// POST /api/investigations/:id/assets -> link an asset to the case
// DBMS concepts: junction table with composite PK, UNIQUE(asset_type, identifier) reuse, transaction (asset + link + event).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(idSchema, params.id);
    const b = parse(linkBody, await readJson(req));

    const asset = await withTransaction(session.userId, async (conn) => {
      await lockCaseForChange(conn, id, session);

      let assetId: number;
      if ("asset_id" in b) {
        const [r] = await conn.execute("SELECT id FROM assets WHERE id = ?", [b.asset_id]);
        if ((r as unknown[]).length === 0) throw fail("Asset not found", 404);
        assetId = b.asset_id;
      } else {
        const [r] = await conn.execute("SELECT id FROM assets WHERE asset_type = ? AND identifier = ?", [b.asset_type, b.identifier]);
        const existing = (r as { id: number }[])[0];
        if (existing) assetId = existing.id;
        else {
          const [ins] = await conn.execute<ResultSetHeader>(
            "INSERT INTO assets (asset_type, identifier, description) VALUES (?, ?, ?)",
            [b.asset_type, b.identifier, b.description ?? null]);
          assetId = ins.insertId;
        }
      }

      await conn.execute("INSERT INTO investigation_assets (investigation_id, asset_id) VALUES (?, ?)", [id, assetId]);
      const [rows] = await conn.execute("SELECT id, asset_type, identifier, description FROM assets WHERE id = ?", [assetId]);
      const a = (rows as { id: number; asset_type: string; identifier: string }[])[0];
      await addEvent(conn, id, "ASSET_LINKED", `Linked ${a.asset_type} ${a.identifier}`, session.userId);
      return a;
    });
    return ok(asset, 201);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("This asset is already linked to the case", 409);
    return handleError(e);
  }
}

// DELETE /api/investigations/:id/assets?asset_id=3 -> unlink (the asset stays in the register for other cases)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(idSchema, params.id);
    const assetId = parse(idSchema, new URL(req.url).searchParams.get("asset_id"));

    await withTransaction(session.userId, async (conn) => {
      await lockCaseForChange(conn, id, session);
      const [res] = await conn.execute(
        "DELETE FROM investigation_assets WHERE investigation_id = ? AND asset_id = ?", [id, assetId]);
      if ((res as { affectedRows: number }).affectedRows === 0) throw fail("That asset is not linked to this case", 404);
      await addEvent(conn, id, "ASSET_UNLINKED", `Unlinked asset #${assetId}`, session.userId);
    });
    return ok({ unlinked: true });
  } catch (e) {
    return handleError(e);
  }
}
