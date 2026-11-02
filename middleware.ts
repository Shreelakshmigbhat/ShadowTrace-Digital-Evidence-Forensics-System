import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Runs before every matched request. It only checks that the session cookie holds a valid, unexpired JWT
// (the Edge runtime cannot query MySQL). The per-role and is_active checks happen in lib/auth.ts, so this is
// the first gate, not the only one: every route handler and page still calls requireRole()/getSession().
const PUBLIC_API = ["/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  // API: no cookie / bad cookie -> JSON 401 (not a redirect, so fetch() callers get a proper error)
  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.includes(pathname) || session) return NextResponse.next();
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // The login page: signed-in users go straight to the dashboard.
  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }

  // Every other page needs a session; remember where the user wanted to go.
  if (!session) {
    const login = new URL("/login", req.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

// Skip Next.js internals and static files (images, fonts, favicon).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)"],
};
