import bcrypt from "bcrypt";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2/promise";
import { query, withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";
import { cleanParams } from "@/lib/evidence-service";

export const dynamic = "force-dynamic";

const ROLE_NAMES = ["ADMIN", "INVESTIGATOR", "ANALYST"] as const;

// Password policy (same rule as app/api/users/[id]/route.ts). Max 72 because bcrypt only reads the first 72 bytes: a longer password would be silently cut.
const passwordRule = z
  .string()
  .min(8, "must be at least 8 characters")
  .max(72, "must be at most 72 characters")
  .regex(/[a-z]/, "must contain a lowercase letter")
  .regex(/[A-Z]/, "must contain an uppercase letter")
  .regex(/[0-9]/, "must contain a digit")
  .regex(/[^A-Za-z0-9]/, "must contain a symbol");

// Never select password_hash for the user list: it must not leave the server.
const USER_COLUMNS = `u.id, u.full_name, u.email, u.is_active, u.created_at, r.role_name`;

const listQuery = z.object({
  role: z.enum(ROLE_NAMES).optional(),
  active: z.enum(["true", "false"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/users (ADMIN) -> user list, optionally filtered by role / active / name or email text
// DBMS concepts: JOIN users-roles, parameterised filters, LIKE search, pagination, column whitelist
//                (password_hash is never returned).
export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const q = parse(listQuery, cleanParams(Object.fromEntries(new URL(req.url).searchParams)));

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.role) { where.push("r.role_name = ?"); params.push(q.role); }
    if (q.active) { where.push("u.is_active = ?"); params.push(q.active === "true" ? 1 : 0); }
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
      where.push("(u.full_name LIKE ? OR u.email LIKE ?)");
      params.push(like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [{ total }] = await query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id ${whereSql}`, params);
    const limit = q.pageSize; // validated integers, safe to inline (mysql2 prepared statements reject "?" in LIMIT)
    const offset = (q.page - 1) * q.pageSize;
    const items = await query(
      `SELECT ${USER_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id ${whereSql}
       ORDER BY u.id LIMIT ${limit} OFFSET ${offset}`, params);

    return ok({ items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) });
  } catch (e) {
    return handleError(e);
  }
}

const createBody = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: passwordRule,
  role: z.enum(ROLE_NAMES),
});

// POST /api/users (ADMIN) -> create a user
// DBMS concepts: bcrypt hashing before INSERT (plain text never stored), INSERT ... SELECT to resolve role id,
//                transaction with an audit row, UNIQUE email error mapped to 409, CHECK constraints as last defence.
export async function POST(req: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    const b = parse(createBody, await readJson(req));
    const hash = await bcrypt.hash(b.password, 10); // 10 = cost factor: 2^10 rounds

    const created = await withTransaction(session.userId, async (conn) => {
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO users (full_name, email, password_hash, role_id)
         SELECT ?, ?, ?, r.id FROM roles r WHERE r.role_name = ?`,
        [b.full_name, b.email, hash, b.role]
      );
      if (res.affectedRows === 0) throw fail("Unknown role", 400);
      await conn.execute(
        "INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('users', ?, 'INSERT', ?)",
        [res.insertId, session.userId]
      );
      const [rows] = await conn.execute(`SELECT ${USER_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [res.insertId]);
      return (rows as any[])[0];
    });

    return ok(created, 201);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("A user with this email already exists", 409);
    return handleError(e);
  }
}
