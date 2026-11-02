// Signing and verifying the session JWT. Uses only `jose`, which also runs on the Edge runtime,
// so middleware.ts can import it. (lib/auth.ts adds the database check on top; that part cannot run on the Edge.)
import { SignJWT, jwtVerify } from "jose";

export type Role = "ADMIN" | "INVESTIGATOR" | "ANALYST";
export type Session = { userId: number; role: Role; name: string };

export const SESSION_COOKIE = "st_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

const ROLES: Role[] = ["ADMIN", "INVESTIGATOR", "ANALYST"];

// The secret comes only from the environment. A short secret would make the signature easy to brute-force.
function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(secret);
}

// HS256 = HMAC-SHA256: anyone holding the secret can sign, so only the server can create valid tokens.
export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(session.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

// Returns the claims inside a valid, unexpired token, or null for anything else (forged, expired, malformed).
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] }); // pin the algorithm
    const userId = Number(payload.sub);
    const role = payload.role as Role;
    if (!Number.isInteger(userId) || userId < 1 || !ROLES.includes(role)) return null;
    return { userId, role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
