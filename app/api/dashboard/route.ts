import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { getDashboard } from "@/lib/core-service";

export const dynamic = "force-dynamic";

// GET /api/dashboard -> numbers for the dashboard page
// DBMS concepts: views (v_investigator_workload), GROUP BY, the monthly_case_stats SUMMARY TABLE (MySQL's stand-in
//                for a materialized view), subqueries, and MongoDB aggregation pipelines over case_notes.
export async function GET() {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    return ok(await getDashboard());
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/dashboard -> rebuild the summary table now (ADMIN). The nightly EVENT does the same on a schedule.
// Plain connection: refresh_monthly_case_stats runs its own START TRANSACTION.
export async function POST() {
  try {
    await requireRole(["ADMIN"]);
    const conn = await pool.getConnection();
    try {
      await conn.execute("CALL refresh_monthly_case_stats()");
    } finally {
      conn.release();
    }
    return ok({ refreshed: true });
  } catch (e) {
    return handleError(e);
  }
}
