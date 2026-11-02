import { z } from "zod";
import { asResponse } from "@/lib/auth";

// Every route answers { data } on success or { error } on failure.
export function ok<T>(data: T, status = 200) {
  return Response.json({ data }, { status });
}
export function fail(error: string, status = 400) {
  return Response.json({ error }, { status });
}

// Validates input with a zod schema. On failure it THROWS a 400 Response,
// which handleError() below turns into { error: "field: message" }.
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw fail(msg, 400);
  }
  return result.data;
}

// Parses a JSON body; a missing/invalid body becomes a 400 instead of a crash.
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw fail("Request body must be valid JSON", 400);
  }
}

// JS Date -> 'YYYY-MM-DD HH:MM:SS' (UTC) for MySQL DATETIME parameters.
export function toSqlDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Friendly text for the CHECK constraints a user can realistically trip.
const CHECK_MESSAGES: Record<string, string> = {
  chk_ev_hash: "file_hash must be a 64-character lowercase hex SHA-256 value",
  chk_ev_status: "Invalid evidence status",
  chk_ev_file: "file_name cannot be empty",
  chk_tr_diff: "Cannot transfer evidence to the same user",
  chk_tr_reason: "Reason must be at least 5 characters",
};

// Turns anything thrown inside a route into a Response. Use in every route:  catch (e) { return handleError(e); }
export function handleError(e: unknown): Response {
  if (e instanceof Response) return e; // thrown by requireRole() or parse()
  const err = e as any;

  // MySQL: our own SIGNAL SQLSTATE '45000' (triggers + transfer_custody) carries a readable message.
  if (err?.sqlState === "45000") return fail(err.sqlMessage, 400);

  switch (err?.errno) {
    case 1062: // duplicate key
      return fail("A record with this unique value already exists (for evidence: this file hash is already registered)", 409);
    case 3819: { // CHECK constraint
      const name = /'([^']+)'/.exec(err.sqlMessage ?? "")?.[1] ?? "";
      return fail(CHECK_MESSAGES[name] ?? `Check constraint failed: ${name}`, 400);
    }
    case 1452: // FK child insert: parent row missing
      return fail("A referenced record (evidence type or user) does not exist", 400);
    case 1451: // FK parent delete/update blocked by RESTRICT
      return fail("Record is referenced by other records and cannot be changed", 409);
    case 1205: // lock wait timeout
    case 1213: // deadlock
      return fail("Evidence is being modified by someone else. Please retry.", 409);
  }

  // MongoDB not reachable (server down, wrong URI): tell the caller plainly instead of answering a bare 500
  if (["MongoServerSelectionError", "MongoNetworkError", "MongoNotConnectedError"].includes(err?.name))
    return fail("MongoDB is unavailable. Please try again later.", 503);

  // MongoDB: 121 = DocumentValidationFailure ($jsonSchema rejected the document)
  if (err?.code === 121) return fail("Artifact does not match the required schema for this evidence type", 400);

  return asResponse(e); // logs and answers 500
}

// For server-component pages: turn anything thrown by the service layer into a message to show.
export async function errorText(e: unknown): Promise<string> {
  if (e instanceof Response) return ((await e.json()) as { error?: string }).error ?? "Request failed";
  console.error(e);
  return "Could not load data. Is the database running?";
}
