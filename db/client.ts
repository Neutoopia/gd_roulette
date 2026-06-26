import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  _db: ReturnType<typeof buildDb> | undefined;
};

function buildDb() {
  const url   = process.env.DATABASE_URL ?? "file:./dev.db";
  const token = process.env.DATABASE_AUTH_TOKEN;
  const client = createClient({ url, authToken: token });
  return drizzle(client, { schema, logger: process.env.NODE_ENV === "development" });
}

export const db: ReturnType<typeof buildDb> =
  globalForDb._db ?? buildDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb._db = db;
}
