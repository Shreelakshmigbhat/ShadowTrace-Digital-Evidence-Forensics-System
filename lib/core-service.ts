// Read-side logic for the investigation module, shared by the API routes (app/api/...) and the
// server-component pages (app/(core)/...). One copy of each SQL statement = no drift between page and API.
import { z } from "zod";
import { pool, query } from "@/lib/db";
import { getDb } from "@/lib/mongo";
import { parse } from "@/lib/api";
import { cleanParams } from "@/lib/evidence-service";
import { notesPerAuthorPerMonth, topNoteTags, mostMentionedEvidence } from "@/db/mongo/case_notes.pipelines";

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const CASE_STATUSES = ["OPEN", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
export const ASSET_TYPES = ["IP", "DOMAIN", "DEVICE", "EMAIL", "ACCOUNT", "WALLET"] as const;

export type CaseRow = {
  id: number; case_code: string; title: string; severity: string; status: string;
  opened_at: Date; closed_at: Date | null; lead_investigator_id: number; lead_investigator: string;
  evidence_count: number; asset_count: number; event_count: number; last_event_at: Date | null; duration_days: number;
  score?: number;
};

// ORDER BY cannot use "?" placeholders, so the client picks a KEY and we map it to SQL we wrote ourselves.
const CASE_SORTS = {
  opened_at: "o.opened_at",
  case_code: "o.case_code",
  title: "o.title",
  status: "o.status",
  severity: "FIELD(o.severity, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", // custom order, not alphabetical
  events: "o.event_count",
  evidence: "o.evidence_count",
} as const;
type CaseSortKey = keyof typeof CASE_SORTS;

const caseListQuery = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  lead: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(2).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
  sort: z.enum(Object.keys(CASE_SORTS) as [CaseSortKey, ...CaseSortKey[]]).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// Concepts: view v_case_overview, FULL-TEXT search with MATCH ... AGAINST (relevance score), a subquery that
// also searches the case timeline, parameterised filters, ORDER BY whitelist, LIMIT/OFFSET pagination.
export async function listInvestigations(rawParams: Record<string, string | string[] | undefined>) {
  const q = parse(caseListQuery, cleanParams(rawParams));

  const selectParams: (string | number)[] = [];
  const where: string[] = [];
  const whereParams: (string | number)[] = [];
  let scoreSql = "";

  if (q.status) { where.push("o.status = ?"); whereParams.push(q.status); }
  if (q.severity) { where.push("o.severity = ?"); whereParams.push(q.severity); }
  if (q.lead) { where.push("o.lead_investigator_id = ?"); whereParams.push(q.lead); }

  if (q.q) {
    if (/^CASE-\d{4}-\d{3}$/i.test(q.q)) {
      where.push("o.case_code = ?"); // a full case code is an exact lookup, not a text search
      whereParams.push(q.q.toUpperCase());
    } else {
      // Natural-language full-text search over the title/code AND over the timeline descriptions.
      scoreSql = ", MATCH(i.title, i.case_code) AGAINST(? IN NATURAL LANGUAGE MODE) AS score";
      selectParams.push(q.q);
      where.push(`(MATCH(i.title, i.case_code) AGAINST(? IN NATURAL LANGUAGE MODE)
                   OR o.id IN (SELECT ev.investigation_id FROM investigation_events ev
                               WHERE MATCH(ev.description) AGAINST(? IN NATURAL LANGUAGE MODE)))`);
      whereParams.push(q.q, q.q);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = `FROM v_case_overview o JOIN investigations i ON i.id = o.id ${whereSql}`;

  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*) AS total ${fromSql}`, whereParams);

  const dir = q.order === "asc" ? "ASC" : "DESC";
  // With a text search and no explicit sort, the best match comes first.
  const orderSql = q.sort
    ? `${CASE_SORTS[q.sort]} ${dir}, o.id DESC`
    : scoreSql ? "score DESC, o.opened_at DESC" : "o.opened_at DESC, o.id DESC";

  // LIMIT/OFFSET inlined: integers already bounded by zod (mysql2 prepared statements reject "?" there on MySQL 8).
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const items = await query<CaseRow>(
    `SELECT o.* ${scoreSql} ${fromSql} ORDER BY ${orderSql} LIMIT ${limit} OFFSET ${offset}`,
    [...selectParams, ...whereParams]
  );
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize), q: q.q ?? null };
}

export type NoteDoc = {
  id: string; investigation_id: number; author_id: number; author_name: string | null; title?: string; body: string;
  tags: string[]; evidence_ids: number[]; attachments: { name: string; size_kb?: number; kind?: string }[];
  created_at: string; updated_at?: string; edit_history: { edited_at: string; edited_by: number; previous_body: string }[];
};

// Notes of one case from MongoDB (newest first), with author names looked up in MySQL.
// Returns null when MongoDB is unreachable so the SQL part of the page still works.
export async function listNotes(investigationId: number): Promise<NoteDoc[] | null> {
  try {
    const docs = await (await getDb()).collection("case_notes")
      .find({ investigation_id: investigationId }).sort({ created_at: -1 }).toArray();
    const ids = [...new Set(docs.map((d) => d.author_id as number))];
    const names = new Map<number, string>();
    if (ids.length) {
      const rows = await query<{ id: number; full_name: string }>(
        `SELECT id, full_name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      rows.forEach((r) => names.set(r.id, r.full_name));
    }
    // JSON round-trip: ObjectId -> string, Date -> ISO string (safe to hand to client components)
    return JSON.parse(JSON.stringify(docs.map((d) => ({
      ...d, id: String(d._id), _id: undefined, author_name: names.get(d.author_id) ?? null,
    }))));
  } catch (err) {
    console.error("Mongo unavailable:", err);
    return null;
  }
}

// Concepts: stored procedure returning FOUR result sets, a stored function (inside it), polyglot persistence.
export async function getCaseDetail(id: number) {
  const [row] = await query<{ case_code: string }>("SELECT case_code FROM investigations WHERE id = ?", [id]);
  if (!row) return null;

  const [sets] = (await pool.execute("CALL get_case_summary(?)", [row.case_code])) as any;
  // mysql2 returns [caseRows, eventRows, evidenceRows, assetRows, okPacket] for a procedure with 4 SELECTs.
  const [caseRows, events, evidence, assets] = sets as any[][];

  return {
    case: caseRows[0] as CaseRow & { days_open: number },
    events: events as { id: number; event_type: string; event_time: Date; description: string; created_by_name: string | null }[],
    evidence: evidence as { id: number; file_name: string; status: string; type_name: string; custodian_name: string; linked_at: Date }[],
    assets: assets as { id: number; asset_type: string; identifier: string; description: string | null; linked_at: Date }[],
    notes: await listNotes(id),
  };
}

// Concepts: views, GROUP BY, summary table (materialized-view substitute), MongoDB aggregation.
export async function getDashboard() {
  const [totals] = await query<any>(
    `SELECT COUNT(*) AS total_cases,
            CAST(SUM(status IN ('OPEN','ACTIVE')) AS UNSIGNED) AS open_cases,
            CAST(SUM(status = 'ON_HOLD') AS UNSIGNED) AS on_hold_cases,
            CAST(SUM(status = 'CLOSED') AS UNSIGNED) AS closed_cases,
            CAST(SUM(status IN ('OPEN','ACTIVE') AND severity = 'CRITICAL') AS UNSIGNED) AS critical_open
     FROM investigations`);
  const [counts] = await query<any>(
    `SELECT (SELECT COUNT(*) FROM evidence) AS evidence_items,
            (SELECT COUNT(*) FROM evidence e WHERE NOT EXISTS
               (SELECT 1 FROM evidence_investigations ei WHERE ei.evidence_id = e.id)) AS unlinked_evidence,
            (SELECT COUNT(*) FROM assets) AS assets`);
  const [byStatus, bySeverity, workload, monthly, recentEvents] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM investigations GROUP BY status ORDER BY FIELD(status,'OPEN','ACTIVE','ON_HOLD','CLOSED')`),
    query(`SELECT severity, COUNT(*) AS count FROM investigations GROUP BY severity ORDER BY FIELD(severity,'LOW','MEDIUM','HIGH','CRITICAL')`),
    query(`SELECT * FROM v_investigator_workload ORDER BY open_cases DESC, full_name`),
    query(`SELECT stat_month, cases_opened, cases_closed, critical_opened,
                  CAST(avg_days_to_close AS DOUBLE) AS avg_days_to_close, refreshed_at
           FROM monthly_case_stats ORDER BY stat_month`),
    query(`SELECT ev.id, ev.event_type, ev.event_time, ev.description, i.id AS investigation_id, i.case_code
           FROM investigation_events ev JOIN investigations i ON i.id = ev.investigation_id
           ORDER BY ev.event_time DESC, ev.id DESC LIMIT 8`),
  ]);

  // MongoDB part: if Mongo is down the SQL numbers are still returned.
  let mongo: { totalNotes: number; notesPerMonth: any[]; topTags: any[]; mostMentionedEvidence: any[] } | null = null;
  try {
    const col = (await getDb()).collection("case_notes");
    const [totalNotes, perAuthorMonth, tags, evidence] = await Promise.all([
      col.countDocuments(),
      col.aggregate([...notesPerAuthorPerMonth]).toArray(),
      col.aggregate([...topNoteTags]).toArray(),
      col.aggregate([...mostMentionedEvidence]).toArray(),
    ]);
    // collapse "per author per month" into "per month" for the chart
    const byMonth = new Map<string, number>();
    for (const r of perAuthorMonth) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.notes);
    const notesPerMonth = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, notes]) => ({ month, notes }));
    mongo = { totalNotes, notesPerMonth, topTags: tags, mostMentionedEvidence: evidence };
  } catch (err) {
    console.error("Mongo unavailable:", err);
  }

  return { totals, counts, byStatus, bySeverity, workload, monthly, recentEvents, mongo };
}

// ---------------------------------------------------------------------------------------------- assets
export type AssetRow = { id: number; asset_type: string; identifier: string; description: string | null; cases_count: number };

const assetListQuery = z.object({
  type: z.enum(ASSET_TYPES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  shared: z.enum(["true"]).optional(), // only assets that appear in more than one case
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Concepts: LEFT JOIN + GROUP BY with COUNT, HAVING (shared assets), LIKE search, pagination.
export async function listAssets(rawParams: Record<string, string | string[] | undefined>) {
  const q = parse(assetListQuery, cleanParams(rawParams));
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.type) { where.push("a.asset_type = ?"); params.push(q.type); }
  if (q.q) {
    where.push("(a.identifier LIKE ? OR a.description LIKE ?)");
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const having = q.shared ? "HAVING COUNT(ia.investigation_id) > 1" : "";
  const base = `FROM assets a LEFT JOIN investigation_assets ia ON ia.asset_id = a.id ${whereSql} GROUP BY a.id, a.asset_type, a.identifier, a.description ${having}`;

  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM (SELECT a.id ${base}) t`, params);
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const items = await query<AssetRow>(
    `SELECT a.id, a.asset_type, a.identifier, a.description, COUNT(ia.investigation_id) AS cases_count
     ${base} ORDER BY cases_count DESC, a.asset_type, a.identifier LIMIT ${limit} OFFSET ${offset}`, params);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

// Concepts: JOIN across the junction table, the same IP/account appearing in several cases.
export async function getAssetWithCases(id: number) {
  const [asset] = await query<{ id: number; asset_type: string; identifier: string; description: string | null }>(
    "SELECT id, asset_type, identifier, description FROM assets WHERE id = ?", [id]);
  if (!asset) return null;
  const cases = await query<CaseRow>(
    `SELECT o.* FROM v_case_overview o JOIN investigation_assets ia ON ia.investigation_id = o.id
     WHERE ia.asset_id = ? ORDER BY o.opened_at DESC`, [id]);
  return { asset, cases };
}

// Lookups for pickers.
export const listLeadCandidates = () =>
  query<{ id: number; full_name: string }>(
    `SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.role_name = 'INVESTIGATOR' AND u.is_active = TRUE ORDER BY u.full_name`);
