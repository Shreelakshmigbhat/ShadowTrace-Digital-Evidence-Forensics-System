import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, handleError } from "@/lib/api";
import { getAssetWithCases } from "@/lib/core-service";

export const dynamic = "force-dynamic";

// GET /api/assets/:id/cases -> the asset and every investigation it appears in
// DBMS concepts: JOIN through the junction table investigation_assets, view v_case_overview.
// This is how an investigator spots a link between cases: the same IP, account or wallet showing up twice.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    const result = await getAssetWithCases(parse(z.coerce.number().int().positive(), params.id));
    if (!result) return fail("Asset not found", 404);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
