import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// Single source of truth for the ephemeral test DB connection. Shared with
// playwright.config.ts so the app-under-test and the truncate/seed fixtures
// can never target different databases.
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:test@localhost:5433/app_test";

// Safety guard, fail-CLOSED: e2e may ONLY talk to a local ephemeral Postgres.
// An allowlist (host must be localhost/127.0.0.1) is correct-by-construction —
// any real database (Neon prod/dev, staging, a recreated branch with a new
// host) is refused, not just three known hostnames. This protects against
// resetDb()'s TRUNCATE ever hitting a real DB.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function testConnectionString(): string {
  const url = TEST_DATABASE_URL;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`e2e DB guard: DATABASE_URL_TEST is not a valid URL.`);
  }

  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `e2e DB guard: refusing to connect — host "${host}" is not a local ` +
        `ephemeral DB. e2e must use localhost/127.0.0.1 only, never a real ` +
        `(Neon/staging) database. Set DATABASE_URL_TEST to the test container.`,
    );
  }
  return url;
}

// Truncate every table the drizzle schema defines — derived from the schema
// object so it never drifts when a table is added. CASCADE handles FK order;
// identifiers are quoted to survive reserved words ("user").
function schemaTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`);
}

let client: ReturnType<typeof postgres> | null = null;

function getTestDb() {
  if (!client) {
    client = postgres(testConnectionString(), { max: 1 });
  }
  return { client, db: drizzle(client, { schema }) };
}

/** Truncate all app tables, resetting identities. Safe-guarded to localhost. */
export async function resetDb(): Promise<void> {
  const { db } = getTestDb();
  const tables = schemaTableNames().join(", ");
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`),
  );
}

/** Close the pooled connection (call in globalTeardown / afterAll). */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}

export { getTestDb };
