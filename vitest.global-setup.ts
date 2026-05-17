/**
 * Vitest global setup: prepare a fresh Postgres schema for the suite. Run ONCE
 * per `vitest run`, before any test file is loaded.
 *
 * We use a REAL Postgres reachable at `TEST_DATABASE_URL` — Prisma is the ORM
 * only; we do NOT use any Prisma migration / hosted-DB tooling here. The
 * schema comes from `prisma/test-schema.sql` (a pure SQL bootstrap, applied
 * with the `pg` client we already depend on transitively via
 * `@prisma/adapter-pg`).
 *
 * Where Postgres comes from:
 *   - CI: a `postgres:16` service container declared in the workflow file.
 *   - Local dev: spin one up yourself (one-line docker run, see TESTING.md).
 *
 * The setup is idempotent — `DROP SCHEMA public CASCADE` wipes whatever was
 * there from a prior run, then `prisma/test-schema.sql` rebuilds from empty.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { TEST_DATABASE_URL } from './lib/test-db'

export async function setup() {
  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  try {
    // Wipe whatever was there from a previous run. CASCADE drops everything
    // owned by the public schema (tables, types, indexes) in one shot.
    await client.query('DROP SCHEMA IF EXISTS "public" CASCADE')
    // Apply the bootstrap SQL — this is the from-empty equivalent of the
    // current prisma/schema.prisma. See prisma/test-schema.sql for how to
    // regenerate it after a schema change.
    const sql = readFileSync('prisma/test-schema.sql', 'utf8')
    await client.query(sql)
  } finally {
    await client.end()
  }
}

export async function teardown() {
  // No-op. The test DB is ephemeral (a postgres:16 service container in CI,
  // a docker container locally); we wipe + rebuild on the next `setup()`.
}
