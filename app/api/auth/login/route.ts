import bcrypt from "bcrypt";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { signSession, type Role } from "@/lib/session-token";
import { setSessionCookie } from "@/lib/session-cookie";
import { ok, fail, parse, readJson, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().toLowerCase().max(150),
  password: z.string().min(1).max(200),
});

// A real bcrypt hash of a random string. When the email is unknown we still run bcrypt.compare against it,
// so "unknown email" and "wrong password" take the same time and an attacker cannot tell them apart.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), 10);

// POST /api/auth/login
// DBMS/security concepts: parameterised lookup of the user, bcrypt.compare (password never stored or compared
// in plain text), httpOnly JWT cookie, LOGIN row written to audit_logs inside a transaction.
// Every failure gives the SAME message, so the response never reveals whether an account exists or is inactive.
export async function POST(req: Request) {
  try {
    const { email, password } = parse(body, await readJson(req));

    const [user] = await query<{ id: number; full_name: string; password_hash: string; is_active: number; role_name: Role }>(
      `SELECT u.id, u.full_name, u.password_hash, u.is_active, r.role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.email = ?`,
      [email]
    );

    const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !matches || !user.is_active) return fail("Invalid email or password", 401);

    const token = await signSession({ userId: user.id, role: user.role_name, name: user.full_name });
    setSessionCookie(token);

    // Audit trail: who logged in and when. The audit_logs table is append-only (trigger-protected).
    await withTransaction(user.id, (conn) =>
      conn.execute("INSERT INTO audit_logs (target_table, target_id, action, user_id) VALUES ('users', ?, 'LOGIN', ?)", [user.id, user.id])
    );

    return ok({ userId: user.id, name: user.full_name, role: user.role_name });
  } catch (e) {
    return handleError(e);
  }
}
