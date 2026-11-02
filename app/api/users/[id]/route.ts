import bcrypt from "bcrypt";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

const ROLE_NAMES = ["ADMIN", "INVESTIGATOR", "ANALYST"] as const;

// Same password policy as creating a user (kept here so this route file only exports HTTP handlers).
const passwordRule = z
  .string()
  .min(8, "must be at least 8 characters")
  .max(72, "must be at most 72 characters")
  .regex(/[a-z]/, "must contain a lowercase letter")
  .regex(/[A-Z]/, "must contain an uppercase letter")
  .regex(/[0-9]/, "must contain a digit")
  .regex(/[^A-Za-z0-9]/, "must contain a symbol");

const patchBody = z
  .object({
    full_name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(150),
    role: z.enum(ROLE_NAMES),
    is_active: z.boolean(),
    password: passwordRule,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Send at least one field to change");

// PATCH /api/users/:id (ADMIN) -> change name, email, role, active flag or password
// DBMS concepts: transaction + SELECT ... FOR UPDATE, dynamic UPDATE built from a fixed column whitelist,
//                guard rules that keep the system administrable (no self-lockout, never remove the last admin),
//                audit row for every change.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const id = parse(z.coerce.number().int().positive(), params.id);
    const b = parse(patchBody, await readJson(req));

    const hash = b.password ? await bcrypt.hash(b.password, 10) : undefined;

    const updated = await withTransaction(session.userId, async (conn) => {
      // Lock the target row, and read its current role.
      const [found] = await conn.execute(
        `SELECT u.id, u.is_active, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? FOR UPDATE`, [id]);
      const target = (found as any[])[0];
      if (!target) throw fail("User not found", 404);

      const losesAdmin = target.role_name === "ADMIN" && target.is_active &&
        ((b.role !== undefined && b.role !== "ADMIN") || b.is_active === false);
      if (losesAdmin) {
        if (id === session.userId) throw fail("You cannot demote or deactivate your own account", 400);
        const [others] = await conn.execute(
          `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
           WHERE r.role_name = 'ADMIN' AND u.is_active = TRUE AND u.id <> ?`, [id]);
        if ((others as any[])[0].n === 0) throw fail("At least one active admin must remain", 400);
      }

      // Only these fixed fragments are ever added to the SQL; the values are always "?" parameters.
      const sets: string[] = [];
      const values: (string | number)[] = [];
      if (b.full_name !== undefined) { sets.push("full_name = ?"); values.push(b.full_name); }
      if (b.email !== undefined) { sets.push("email = ?"); values.push(b.email); }
      if (b.is_active !== undefined) { sets.push("is_active = ?"); values.push(b.is_active ? 1 : 0); }
      if (b.role !== undefined) { sets.push("role_id = (SELECT id FROM roles WHERE role_name = ?)"); values.push(b.role); }
      if (hash !== undefined) { sets.push("password_hash = ?"); values.push(hash); }

      await conn.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
      await conn.execute(
        "INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('users', ?, 'UPDATE', ?)",
        [id, session.userId]
      );
      const [rows] = await conn.execute(
        `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, r.role_name
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [id]);
      return (rows as any[])[0];
    });

    return ok(updated);
  } catch (e: any) {
    if (e?.errno === 1062) return fail("A user with this email already exists", 409);
    return handleError(e);
  }
}
