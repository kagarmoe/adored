import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

// e2e talks ONLY to the ephemeral Postgres (e2e/fixtures/test-db.sh, :5433).
// These hosts are the real Neon branches — if a test ever resolves to one of
// them, throw before opening a connection. Defense-in-depth so a misconfig
// can never truncate prod or shared dev data.
const FORBIDDEN_HOSTS = [
  "ep-empty-mode", // Neon `main` (production)
  "ep-old-meadow", // Neon `development`
  "neon.tech", // any Neon host at all
];

function testConnectionString(): string {
  const url =
    process.env.DATABASE_URL_TEST ??
    "postgresql://postgres:test@localhost:5433/purseinator_test";

  for (const host of FORBIDDEN_HOSTS) {
    if (url.includes(host)) {
      throw new Error(
        `e2e DB guard: refusing to connect — DATABASE_URL_TEST resolves to a forbidden host (${host}). ` +
          `e2e must use the ephemeral local Postgres, never a Neon branch.`,
      );
    }
  }
  return url;
}

// Tables to truncate between tests, in no particular order (CASCADE handles FKs).
// NextAuth tables (user/account/session/verificationToken) included so seeded
// users reset too.
const TABLES = [
  "decision_events",
  "preferences",
  "sort_result_items",
  "sort_result_shares",
  "sort_results",
  "photos",
  "items",
  "memberships",
  "invitations",
  "sessions",
  "collections",
  "account",
  "session",
  '"verificationToken"', // mixed-case identifier — must be quoted
  '"user"', // reserved word — quote it
];

let client: ReturnType<typeof postgres> | null = null;

function getTestDb() {
  if (!client) {
    client = postgres(testConnectionString(), { max: 1 });
  }
  return { client, db: drizzle(client, { schema }) };
}

/** Truncate all app tables, resetting identities. Safe-guarded against Neon. */
export async function resetDb(): Promise<void> {
  const { db } = getTestDb();
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`),
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
