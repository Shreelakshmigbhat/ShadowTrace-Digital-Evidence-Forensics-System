// ===========================================================================
// AUTH CONTRACT  (shared by Member A and Member B)
//
// getSession() and requireRole(roles[]) keep the signatures every route and page already uses.
// Real implementation: the session is a signed JWT in an httpOnly cookie (see lib/session-token.ts).
// ===========================================================================
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { SESSION_COOKIE, verifySession, type Role, type Session } from "@/lib/session-token";

export type { Role, Session };

// Returns the current user, or null if nobody is logged in.
// The token proves WHO the user is, but the database is asked for what they may do NOW:
// a user who was deactivated, or whose role was changed, is treated accordingly on the very next request
// instead of keeping their old powers until the token expires.
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const [user] = await query<{ full_name: string; is_active: number; role_name: Role }>(
    `SELECT u.full_name, u.is_active, r.role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [claims.userId]
  );
  if (!user || !user.is_active) return null;

  return { userId: claims.userId, role: user.role_name, name: user.full_name };
}

// Use at the top of a route handler:  const s = await requireRole(["ADMIN"]);
// Throws a Response (401 not logged in / 403 wrong role). Catch it with `handleError` / `asResponse`.
export async function requireRole(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) throw Response.json({ error: "Not logged in" }, { status: 401 });
  if (!roles.includes(session.role)) throw Response.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

// Helper so route handlers can do:  catch (e) { return asResponse(e); }
export function asResponse(e: unknown): Response {
  if (e instanceof Response) return e;
  console.error(e);
  return Response.json({ error: "Server error" }, { status: 500 });
}
