import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-token";

// The token lives in an httpOnly cookie: JavaScript in the browser cannot read it, so a script injected
// into a page (XSS) cannot steal the session. sameSite=lax stops other sites from making the browser
// send it on cross-site POSTs (CSRF). `secure` makes the browser send it over https only (production).
export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
