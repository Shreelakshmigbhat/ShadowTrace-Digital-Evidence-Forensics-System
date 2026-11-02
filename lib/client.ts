// Browser-side helpers (used only by "use client" components).

// SHA-256 of a file, computed in the browser. Only the hex string is ever sent to the server.
// crypto.subtle needs a secure context (https or localhost). The whole file is read into memory,
// which is fine for a demo; production systems would hash in streaming chunks.
export async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Hashing needs https or localhost (crypto.subtle is unavailable)");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Calls our API and unwraps the { data } | { error } envelope.
export async function callApi<T = any>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  url: string,
  body?: unknown
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Request failed (${res.status})` };
    return { data: json.data as T };
  } catch {
    return { error: "Network error" };
  }
}
