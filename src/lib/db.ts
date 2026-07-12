import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// A pathological query (an accidental O(N²) recompute, a missing index, a lock
// wait that never resolves) should FAIL FAST rather than silently eat the whole
// 30s Vercel function budget and surface as an opaque function timeout. Set a
// server-side statement_timeout GENEROUS but UNDER that cap (25s): Postgres then
// aborts the offending statement with SQLSTATE 57014 — which logDbError already
// classifies as `statement_timeout` and flags as a rolled-back write. Normal
// recomputes are tens of ms, nowhere near this, so the hot path never trips it.
// postgres-js sends `connection.*` as startup parameters; the value is ms.
const client = postgres(connectionString, {
  connection: { statement_timeout: 25_000 },
});
// Drizzle's built-in query logger logs every query's SQL AND its param VALUES
// (emails, tokens, PII) and is noisy — Vercel caps runtime logs at 256 lines
// per request. So it is OFF by default and MUST NEVER be enabled in production;
// it's a local "see the SQL" aid only. Opt in per shell via DB_QUERY_LOG=1
// (an optional env var read directly, not routed through the validated proxy).
const db = drizzle(client, { schema, logger: process.env.DB_QUERY_LOG === "1" });

// The SHARED BASE CLASS of the root db and a transaction — not `typeof db`.
// PostgresJsDatabase and PgTransaction both extend PgDatabase with the same
// generics, so a `tx` satisfies this and withTransaction's callback typechecks.
// Narrowing this back to `typeof db` (the concrete PostgresJsDatabase) breaks
// every withTransaction caller: a tx is not assignable to it.
// It carries a `protected authToken`, so an object-literal mock can never
// `satisfies Database` — test doubles must go through `as unknown as Database`.
export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export function getDb(): Database {
  return db;
}
