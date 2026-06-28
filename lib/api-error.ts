import { NextResponse } from "next/server";

/**
 * Classifies a raw error thrown by Drizzle / libsql / Turso into a
 * human-readable message and an appropriate HTTP status code.
 *
 * Turso / libsql errors typically have a `message` string. The most
 * common ones you'll hit in production:
 *   - "no such table: ..."        → schema not pushed yet
 *   - "SQLITE_CONSTRAINT: ..."    → unique / FK violation
 *   - "unable to open database"   → bad DATABASE_URL
 *   - network / fetch errors      → Turso unreachable
 */
export function classifyDbError(err: unknown): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("no such table")) {
    return {
      message:
        "Database tables are missing. Run `npx drizzle-kit push` against your Turso database first.",
      status: 503,
    };
  }
  if (msg.includes("SQLITE_CONSTRAINT_UNIQUE") || msg.includes("UNIQUE constraint failed")) {
    return { message: "A record with that value already exists.", status: 409 };
  }
  if (
    msg.includes("unable to open database") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch")
  ) {
    return {
      message:
        "Cannot reach the database. Check your DATABASE_URL and DATABASE_AUTH_TOKEN environment variables.",
      status: 503,
    };
  }
  if (msg.includes("SQLITE_CONSTRAINT_FOREIGNKEY") || msg.includes("FOREIGN KEY constraint")) {
    return { message: "Referenced record does not exist.", status: 400 };
  }
  if (msg.includes("UNAUTHORIZED") || msg.includes("401")) {
    return {
      message:
        "Database authentication failed. Check your DATABASE_AUTH_TOKEN.",
      status: 503,
    };
  }

  // Unknown — log the real error server-side, send generic message to client
  return { message: "An unexpected server error occurred.", status: 500 };
}

/** Log an error with context then return a typed NextResponse. */
export function dbError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);
  const { message, status } = classifyDbError(err);
  return NextResponse.json({ error: message }, { status });
}

/** Generic 500 for non-db errors. */
export function serverError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  return NextResponse.json({ error: message }, { status: 500 });
}
