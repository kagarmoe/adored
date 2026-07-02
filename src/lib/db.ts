import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(connectionString);
// Drizzle's built-in query logger logs every query's SQL AND its param VALUES
// (emails, tokens, PII) and is noisy — Vercel caps runtime logs at 256 lines
// per request. So it is OFF by default and MUST NEVER be enabled in production;
// it's a local "see the SQL" aid only. Opt in per shell via DB_QUERY_LOG=1
// (an optional env var read directly, not routed through the validated proxy).
const db = drizzle(client, { schema, logger: process.env.DB_QUERY_LOG === "1" });

export type Database = typeof db;

export function getDb(): Database {
  return db;
}
