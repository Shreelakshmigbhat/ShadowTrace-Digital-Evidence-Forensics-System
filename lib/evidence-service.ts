// Read-side logic for the evidence module, shared by the API routes (app/api/...) and the
// server-component pages (app/(evidence)/...). One copy of each SQL statement = no drift.
import { z } from "zod";
import { query } from "@/lib/db";
import { getDb } from "@/lib/mongo";
import { parse } from "@/lib/api";
import { highSeverityByType, topTags, topMobileApps, findingSeverityCounts } from "@/db/mongo/evidence_artifacts.pipelines";

export const STATUSES = ["COLLECTED", "IN_ANALYSIS", "IN_STORAGE", "RELEASED", "DESTROYED"] as const;
export type Status = (typeof STATUSES)[number];

export type EvidenceRow = {
  id: number; file_name: string; file_hash: string; status: Status; type_name: string;
  collected_by_name: string; custodian_name: string; custodian_id: number; collected_at: Date;
};
export type ChainRow = {
  evidence_id: number; transfer_seq: number; from_user: string; to_user: string; reason: string; transferred_at: Date;
};

// ORDER BY cannot use "?" placeholders, so the client only picks a KEY from this whitelist
// and we map it to a column we wrote ourselves. User text never reaches the SQL string.
export const SORT_COLUMNS = {
  id: "id", file_name: "file_name", status: "status", type: "type_name",
  custodian: "custodian_name", collected_at: "collected_at",
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.string().trim().min(1).max(50).optional(), // type name, e.g. "Disk Image"
  custodian: z.coerce.number().int().positive().optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(Object.keys(SORT_COLUMNS) as [SortKey, ...SortKey[]]).default("collected_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// Drops empty values (?status=) so an untouched filter field does not fail validation.
export function cleanParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined && s !== "") out[k] = s;
  }
  return out;
}

// Concepts: view v_evidence_current, parameterised WHERE, LIKE search, ORDER BY whitelist, LIMIT/OFFSET, COUNT(*).
export async function listEvidence(rawParams: Record<string, string | string[] | undefined>) {
  const q = parse(listQuery, cleanParams(rawParams));

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.status) { where.push("status = ?"); params.push(q.status); }
  if (q.type) { where.push("type_name = ?"); params.push(q.type); }
  if (q.custodian) { where.push("custodian_id = ?"); params.push(q.custodian); }
  if (q.search) {
    // escape LIKE wildcards typed by the user so "50%" searches for a literal percent sign
    where.push("file_name LIKE ?");
    params.push(`%${q.search.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM v_evidence_current ${whereSql}`, params);

  // LIMIT/OFFSET are inlined: integers already bounded by zod, and mysql2 prepared statements reject "?" there on MySQL 8.
  const limit = q.pageSize;
  const offset = (q.page - 1) * q.pageSize;
  const items = await query<EvidenceRow>(
    `SELECT * FROM v_evidence_current ${whereSql}
     ORDER BY ${SORT_COLUMNS[q.sort]} ${q.order === "asc" ? "ASC" : "DESC"}, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize), sort: q.sort, order: q.order };
}

// Concepts: two views (one uses ROW_NUMBER()), SQL + MongoDB combined through evidence_id.
export async function getEvidenceDetail(id: number) {
  const [evidence] = await query<EvidenceRow>("SELECT * FROM v_evidence_current WHERE id = ?", [id]);
  if (!evidence) return null;

  const chain = await query<ChainRow>("SELECT * FROM v_chain_of_custody WHERE evidence_id = ? ORDER BY transfer_seq", [id]);

  // A MongoDB outage should not hide the SQL record, so degrade to null instead of failing.
  let artifact: Record<string, any> | null = null;
  try {
    const db = await getDb();
    artifact = await db.collection("evidence_artifacts").findOne({ evidence_id: id }, { projection: { _id: 0 } });
  } catch (err) {
    console.error("Mongo unavailable:", err);
  }
  return { evidence, chain, artifact };
}

// Concepts: GROUP BY/HAVING, aggregates, anti-join, CTE + LAG(), conditional aggregation, Mongo pipelines.
// (SUM/AVG are CAST because mysql2 returns DECIMAL as a string.)
export async function getEvidenceStats() {
  const [byStatus, statusByType, perCustodian, custodiansOver3, neverTransferred, mostTransferred, avgGap] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM evidence GROUP BY status ORDER BY count DESC`),

    query(`SELECT t.type_name, COUNT(e.id) AS total,
                  CAST(SUM(e.status = 'COLLECTED') AS UNSIGNED)   AS collected,
                  CAST(SUM(e.status = 'IN_ANALYSIS') AS UNSIGNED) AS in_analysis,
                  CAST(SUM(e.status = 'IN_STORAGE') AS UNSIGNED)  AS in_storage,
                  CAST(SUM(e.status IN ('RELEASED','DESTROYED')) AS UNSIGNED) AS closed_out
           FROM evidence_types t
           LEFT JOIN evidence e ON e.evidence_type_id = t.id
           GROUP BY t.id, t.type_name
           ORDER BY total DESC`),

    query(`SELECT u.id, u.full_name, COUNT(*) AS items_held
           FROM evidence e JOIN users u ON u.id = e.custodian_id
           GROUP BY u.id, u.full_name
           ORDER BY items_held DESC, u.full_name`),

    // GROUP BY + HAVING: custodians holding more than 3 items
    query(`SELECT u.id, u.full_name, COUNT(*) AS items_held
           FROM evidence e JOIN users u ON u.id = e.custodian_id
           GROUP BY u.id, u.full_name
           HAVING COUNT(*) > ?
           ORDER BY items_held DESC`, [3]),

    // LEFT JOIN ... IS NULL: evidence never transferred
    query(`SELECT e.id, e.file_name, e.status, u.full_name AS custodian
           FROM evidence e
           LEFT JOIN evidence_transfers tr ON tr.evidence_id = e.id
           JOIN users u ON u.id = e.custodian_id
           WHERE tr.id IS NULL
           ORDER BY e.id`),

    query(`SELECT e.id, e.file_name, COUNT(tr.id) AS transfer_count, MAX(tr.transferred_at) AS last_transfer
           FROM evidence e JOIN evidence_transfers tr ON tr.evidence_id = e.id
           GROUP BY e.id, e.file_name
           ORDER BY transfer_count DESC, last_transfer DESC
           LIMIT 5`),

    // CTE + LAG(): hours between consecutive custody events, averaged per evidence type
    query(`WITH gaps AS (
             SELECT e.evidence_type_id,
                    TIMESTAMPDIFF(HOUR,
                      LAG(tr.transferred_at, 1, e.collected_at) OVER (PARTITION BY tr.evidence_id ORDER BY tr.transferred_at),
                      tr.transferred_at) AS hours_gap
             FROM evidence_transfers tr JOIN evidence e ON e.id = tr.evidence_id)
           SELECT t.type_name, COUNT(*) AS transfers, CAST(ROUND(AVG(g.hours_gap), 1) AS DOUBLE) AS avg_hours_between
           FROM gaps g JOIN evidence_types t ON t.id = g.evidence_type_id
           GROUP BY t.id, t.type_name
           ORDER BY avg_hours_between DESC`),
  ]);

  // MongoDB part: if Mongo is down the SQL statistics are still returned.
  let mongo: { highSeverityByType: any[]; topTags: any[]; topMobileApps: any[]; severities: any[] } | null = null;
  try {
    const col = (await getDb()).collection("evidence_artifacts");
    const [high, tags, apps, severities] = await Promise.all([
      col.aggregate([...highSeverityByType]).toArray(),
      col.aggregate([...topTags]).toArray(),
      col.aggregate([...topMobileApps]).toArray(),
      col.aggregate([...findingSeverityCounts]).toArray(),
    ]);
    mongo = { highSeverityByType: high, topTags: tags, topMobileApps: apps, severities };
  } catch (err) {
    console.error("Mongo unavailable:", err);
  }
  return { sql: { byStatus, statusByType, perCustodian, custodiansOver3, neverTransferred, mostTransferred, avgGap }, mongo };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const auditQuery = z.object({
  table: z.string().trim().min(1).max(50).optional(),
  target_id: z.coerce.number().int().positive().optional(),
  action: z.enum(["INSERT", "UPDATE", "DELETE", "TRANSFER", "LOGIN"]).optional(),
  user: z.coerce.number().int().positive().optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditRow = {
  id: number; target_table: string; target_id: number; action: string; created_at: Date; user_id: number | null; user_name: string | null;
};

// Concepts: trigger-filled append-only log, LEFT JOIN (user_id may be NULL), idx_audit_target, date-range filter.
export async function listAudit(rawParams: Record<string, string | string[] | undefined>) {
  const q = parse(auditQuery, cleanParams(rawParams));

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.table) { where.push("a.target_table = ?"); params.push(q.table); }
  if (q.target_id) { where.push("a.target_id = ?"); params.push(q.target_id); }
  if (q.action) { where.push("a.action = ?"); params.push(q.action); }
  if (q.user) { where.push("a.user_id = ?"); params.push(q.user); }
  if (q.from) { where.push("a.created_at >= ?"); params.push(q.from); }
  if (q.to) { where.push("a.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(q.to); } // "to" includes the whole day
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  const limit = q.pageSize; // integers validated by zod, so safe to inline
  const offset = (q.page - 1) * q.pageSize;
  const items = await query<AuditRow>(
    `SELECT a.id, a.target_table, a.target_id, a.action, a.created_at, a.user_id, u.full_name AS user_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

// Small lookups used by filter bars and forms.
export const listTypes = () => query<{ id: number; type_name: string }>("SELECT id, type_name FROM evidence_types ORDER BY type_name");
export const listCustodians = () =>
  query<{ id: number; full_name: string }>(
    "SELECT DISTINCT u.id, u.full_name FROM users u JOIN evidence e ON e.custodian_id = u.id ORDER BY u.full_name"
  );
export const listActiveUsers = () =>
  query<{ id: number; full_name: string }>("SELECT id, full_name FROM users WHERE is_active = TRUE ORDER BY full_name");
