import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, handleError } from "@/lib/api";
import { getEvidenceDetail } from "@/lib/evidence-service";

export const dynamic = "force-dynamic";

// GET /api/evidence/:id -> one evidence item from THREE places:
//   1. MySQL view v_evidence_current   (the record)
//   2. MySQL view v_chain_of_custody   (every transfer, numbered with ROW_NUMBER())
//   3. MongoDB evidence_artifacts      (type-specific forensic metadata, or null if none yet)
// DBMS concepts: views, window function (inside the view), polyglot persistence (SQL + NoSQL joined by evidence_id).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const id = parse(z.coerce.number().int().positive(), params.id);
    const detail = await getEvidenceDetail(id);
    if (!detail) return fail("Evidence not found", 404);
    return ok(detail);
  } catch (e) {
    return handleError(e);
  }
}
