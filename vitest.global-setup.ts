/**
 * Vitest global setup: boots a local Prisma Dev (pglite) server and pushes the
 * current `prisma/schema.prisma` into it. Run ONCE per `vitest run`, before
 * any test file is loaded.
 *
 * The server runs in-process inside Prisma's pglite runtime — no Docker, no
 * native Postgres install required, but it speaks the wire protocol so
 * `@prisma/adapter-pg` connects to it exactly like a real Neon/Postgres URL.
 *
 * Idempotency: `prisma dev -n purse-test --detach` returns the same connection
 * string whether the server was just started or already running, so re-runs in
 * `vitest --watch` are cheap. The server is intentionally NOT stopped on
 * teardown — leaving it running keeps the next `npm test` fast.
 */
import { execSync } from 'node:child_process'
import { TEST_DATABASE_URL } from './lib/test-db'

const SERVER_NAME = 'purse-test'

export async function setup() {
  // Start (or reattach to) the Prisma Dev server. Prisma's config loader
  // requires DATABASE_URL to be resolvable even for `dev` subcommands.
  execSync(`npx prisma dev -n ${SERVER_NAME} --detach`, {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })

  // Push schema.prisma into the test server. `--accept-data-loss` is safe
  // here: the test DB is ephemeral and we're about to TRUNCATE it anyway.
  execSync(`npx prisma db push --accept-data-loss`, {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })
}

export async function teardown() {
  // Intentionally a no-op: leaving the pglite server running between
  // `vitest run` invocations is what makes the next run start fast. Stop it
  // manually with `npx prisma dev stop -n purse-test` if you need a clean slate.
}
