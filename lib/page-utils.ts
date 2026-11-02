// Small helpers for server-component pages.

// Builds "?a=1&b=2" from current params plus overrides (undefined/"" removes a key).
export function buildQuery(current: Record<string, string>, overrides: Record<string, string | number | undefined>): string {
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  const s = new URLSearchParams(merged).toString();
  return s ? `?${s}` : "";
}

// Dates are shown in UTC on purpose: the server and database both use UTC, so nothing shifts between renders.
export function fmtDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
