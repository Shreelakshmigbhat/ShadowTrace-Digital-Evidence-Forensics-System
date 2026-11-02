import { getSession } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/auth/me -> who am I? (role and active flag are re-checked in MySQL by getSession)
export async function GET() {
  const session = await getSession();
  if (!session) return fail("Not logged in", 401);
  return ok(session);
}
