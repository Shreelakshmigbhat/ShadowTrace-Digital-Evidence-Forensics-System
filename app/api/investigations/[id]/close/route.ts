import { z } from "zod";
import { pool, query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, parse, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/investigations/:id/close -> close a case (lead investigator or admin; the procedure enforces it)
// DBMS concepts: STORED PROCEDURE with its own transaction (status + close date + timeline event, all or nothing),
//                SIGNAL SQLSTATE '45000' messages shown to the user as 400s, row lock inside the procedure.
//
// NOT wrapped in withTransaction(): close_investigation runs START TRANSACTION itself, and a START TRANSACTION
// inside an open transaction silently COMMITS the outer one. So: one plain connection, SET @app_user_id, CALL.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const id = parse(z.coerce.number().int().positive(), params.id);

    const conn = await pool.getConnection();
    try {
      await conn.execute("SET @app_user_id = ?", [session.userId]);
      await conn.execute("CALL close_investigation(?, ?)", [id, session.userId]);
    } finally {
      await conn.query("SET @app_user_id = NULL").catch(() => {}); // pooled connections are reused: never leak the user
      conn.release();
    }

    const [row] = await query("SELECT * FROM v_case_overview WHERE id = ?", [id]);
    return ok(row);
  } catch (e) {
    return handleError(e);
  }
}
