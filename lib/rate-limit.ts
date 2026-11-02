// A tiny in-memory login rate limiter: after MAX_FAILURES wrong attempts for the same (IP, email) pair,
// further attempts are refused until the window ends. It also caps failures per IP across all emails, which
// stops one address from trying thousands of different accounts ("password spraying").
//
// Limits of the design (acceptable for a single-server demo): the counters live in this process's memory, so
// they reset when the server restarts and are not shared between several server instances. A production
// system would keep them in Redis or the database.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;

type Entry = { count: number; resetAt: number };
const g = globalThis as unknown as { loginFailures?: Map<string, Entry> };
const failures = (g.loginFailures ??= new Map<string, Entry>()); // survives dev-mode module reloads

function current(key: string, now: number): Entry | undefined {
  const e = failures.get(key);
  if (e && e.resetAt <= now) {
    failures.delete(key); // window over: forget the old failures
    return undefined;
  }
  return e;
}

// Call BEFORE checking the password. Returns how many seconds to wait, or 0 if the attempt may proceed.
export function loginRetryAfterSeconds(ip: string, email: string, now = Date.now()): number {
  const account = current(`acct|${ip}|${email}`, now);
  const byIp = current(`ip|${ip}`, now);
  let until = 0;
  if (account && account.count >= MAX_FAILURES_PER_ACCOUNT) until = Math.max(until, account.resetAt);
  if (byIp && byIp.count >= MAX_FAILURES_PER_IP) until = Math.max(until, byIp.resetAt);
  return until ? Math.ceil((until - now) / 1000) : 0;
}

function bump(key: string, now: number) {
  const e = current(key, now);
  if (e) e.count += 1;
  else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()) {
  bump(`acct|${ip}|${email}`, now);
  bump(`ip|${ip}`, now);
  if (failures.size > 5000) for (const k of failures.keys()) current(k, now); // drop expired entries
}

// A successful login clears that account's counter (but not the per-IP one).
export function recordLoginSuccess(ip: string, email: string) {
  failures.delete(`acct|${ip}|${email}`);
}

// Best-effort client address behind a proxy; falls back to a fixed label when unknown (e.g. local dev).
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
