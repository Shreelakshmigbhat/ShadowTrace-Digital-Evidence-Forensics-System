import { requireRole } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { getEvidenceStats } from "@/lib/evidence-service";

export const dynamic = "force-dynamic";

// GET /api/evidence/stats -> dashboard numbers for the evidence module.
// DBMS concepts: GROUP BY + HAVING, aggregates (COUNT/SUM/AVG/MAX), LEFT JOIN anti-join,
//                CTE + window function LAG(), conditional aggregation, MongoDB aggregation pipelines.
export async function GET() {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    return ok(await getEvidenceStats());
  } catch (e) {
    return handleError(e);
  }
}
