import { z } from "zod";
import type { ResultSetHeader } from "mysql2/promise";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { listInvestigations, SEVERITIES } from "@/lib/core-service";
import { addEvent, assertEligibleLead } from "@/lib/case-access";

export const dynamic = "force-dynamic";

// GET /api/investigations -> filtered, sorted, paginated cases; ?q= runs a FULL-TEXT search
// DBMS concepts: view v_case_overview, MATCH ... AGAINST with relevance score (title/code AND timeline text),
//                parameterised filters, ORDER BY whitelist, pagination. (SQL lives in lib/core-service.ts.)
export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN", "INVESTIGATOR", "ANALYST"]);
    return ok(await listInvestigations(Object.fromEntries(new URL(req.url).searchParams)));
  } catch (e) {
    return handleError(e);
  }
}

const createBody = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
  case_code: z.string().trim().toUpperCase().regex(/^CASE-\d{4}-\d{3}$/, "must look like CASE-2025-001").optional(),
  // Investigators always lead their own cases; an admin must say who leads.
  lead_investigator_id: z.coerce.number().int().positive().optional(),
});

// POST /api/investigations -> open a new case (INVESTIGATOR, ADMIN)
// DBMS concepts: transaction (case row + OPENED timeline event commit together), next case number computed under
//                a lock (SELECT ... FOR UPDATE), UNIQUE case_code, CHECK constraints as last defence.
export async function POST(req: Request) {
  try {
    const session = await requireRole(["INVESTIGATOR", "ADMIN"]);
    const b = parse(createBody, await readJson(req));

    const lead = session.role === "ADMIN" ? b.lead_investigator_id : session.userId;
    if (!lead) throw fail("lead_investigator_id is required when an admin opens a case", 400);

    const row = await withTransaction(session.userId, async (conn) => {
      await assertEligibleLead(conn, lead);

      let code = b.case_code;
      if (!code) {
        // Next number for this year. FOR UPDATE makes two simultaneous requests take turns instead of both getting 007.
        const year = new Date().getUTCFullYear();
        const [r] = await conn.execute(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(case_code, 11) AS UNSIGNED)), 0) + 1 AS n
           FROM investigations WHERE case_code LIKE ? FOR UPDATE`, [`CASE-${year}-%`]);
        const n = (r as { n: number }[])[0].n;
        if (n > 999) throw fail("No case numbers left for this year", 409);
        code = `CASE-${year}-${String(n).padStart(3, "0")}`;
      }

      const [res] = await conn.execute<ResultSetHeader>(
        "INSERT INTO investigations (title, case_code, severity, lead_investigator_id) VALUES (?, ?, ?, ?)",
        [b.title, code, b.severity, lead]
      );
      await addEvent(conn, res.insertId, "OPENED", `Case opened: ${b.title}`, session.userId);
      const [rows] = await conn.execute("SELECT * FROM v_case_overview WHERE id = ?", [res.insertId]);
      return (rows as unknown[])[0];
    });

    return ok(row, 201);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("That case code already exists", 409);
    return handleError(e);
  }
}
