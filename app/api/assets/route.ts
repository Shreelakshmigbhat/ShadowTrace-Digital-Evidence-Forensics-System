import { z } from "zod";
import type { ResultSetHeader } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { ASSET_TYPES, listAssets } from "@/lib/core-service";

export const dynamic = "force-dynamic";

// GET /api/assets -> asset register with how many cases each asset appears in; ?shared=true keeps only assets in 2+ cases
// DBMS concepts: LEFT JOIN + GROUP BY + COUNT, HAVING COUNT(...) > 1, LIKE search, type filter, pagination.
export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    return ok(await listAssets(Object.fromEntries(new URL(req.url).searchParams)));
  } catch (e) {
    return handleError(e);
  }
}

const createBody = z.object({
  asset_type: z.enum(ASSET_TYPES),
  identifier: z.string().trim().min(2).max(255),
  description: z.string().trim().max(255).optional(),
});

// POST /api/assets -> register an asset (INVESTIGATOR, ADMIN)
// DBMS concepts: UNIQUE(asset_type, identifier) so one IP is one asset however many cases use it, CHECK on type,
//                transaction with the acting user set for triggers (@app_user_id).
export async function POST(req: Request) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const b = parse(createBody, await readJson(req));

    const asset = await withTransaction(session.userId, async (conn) => {
      const [res] = await conn.execute<ResultSetHeader>(
        "INSERT INTO assets (asset_type, identifier, description) VALUES (?, ?, ?)",
        [b.asset_type, b.identifier, b.description ?? null]
      );
      const [rows] = await conn.execute("SELECT id, asset_type, identifier, description FROM assets WHERE id = ?", [res.insertId]);
      return (rows as unknown[])[0];
    });
    return ok(asset, 201);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("This asset already exists in the register (same type and identifier)", 409);
    return handleError(e);
  }
}
