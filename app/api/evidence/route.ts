import { z } from "zod";
import type { ResultSetHeader } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, parse, readJson, handleError, toSqlDateTime } from "@/lib/api";
import { listEvidence } from "@/lib/evidence-service";

export const dynamic = "force-dynamic"; // never cache: data changes constantly

// GET /api/evidence  -> filtered, sorted, paginated list from the view v_evidence_current
// DBMS concepts: VIEW, parameterised WHERE, LIKE search, ORDER BY whitelist, LIMIT/OFFSET pagination,
//                COUNT(*) for the total. (SQL lives in lib/evidence-service.ts, shared with the page.)
export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    return ok(await listEvidence(Object.fromEntries(new URL(req.url).searchParams)));
  } catch (e) {
    return handleError(e);
  }
}

const createBody = z.object({
  file_name: z.string().trim().min(1).max(255),
  // The browser computes SHA-256 (crypto.subtle) and sends 64 hex chars. We lowercase it, then
  // validate again here; the database CHECK + UNIQUE are the last line of defence.
  file_hash: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/, "must be 64 hex characters (SHA-256)"),
  evidence_type_id: z.coerce.number().int().positive(),
  collected_at: z.coerce.date().optional(), // omitted -> current time
});

// POST /api/evidence -> register new evidence; the creator becomes collector AND first custodian
// DBMS concepts: transaction (withTransaction), AFTER INSERT audit trigger (via @app_user_id),
//                CHECK + UNIQUE + FOREIGN KEY errors mapped to friendly messages,
//                BEFORE INSERT trigger (collected_at not in the future).
export async function POST(req: Request) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const body = parse(createBody, await readJson(req));

    const row = await withTransaction(session.userId, async (conn) => {
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO evidence (file_hash, file_name, collected_at, evidence_type_id, collected_by, custodian_id)
         VALUES (?, ?, COALESCE(?, NOW()), ?, ?, ?)`,
        [
          body.file_hash,
          body.file_name,
          body.collected_at ? toSqlDateTime(body.collected_at) : null,
          body.evidence_type_id,
          session.userId,
          session.userId,
        ]
      );
      const [rows] = await conn.execute("SELECT * FROM v_evidence_current WHERE id = ?", [res.insertId]);
      return (rows as any[])[0];
    });

    return ok(row, 201);
  } catch (e) {
    return handleError(e);
  }
}
