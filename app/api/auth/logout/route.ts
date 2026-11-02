import { clearSessionCookie } from "@/lib/session-cookie";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/auth/logout -> expires the session cookie. (The JWT itself is stateless; it simply stops being sent.)
export async function POST() {
  clearSessionCookie();
  return ok({ loggedOut: true });
}
