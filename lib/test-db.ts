/**
 * Test database client — a real Postgres-compatible server (Prisma Dev / pglite)
 * that tests can drive via the same Prisma client the app uses in production.
 *
 * Why this exists: `vi.mock('@/lib/db')` substitutes a hand-rolled fake for the
 * entire Prisma client, so the mocked DB has whatever schema the test pretends
 * it has and real-schema drift is invisible (the structural cause of the
 * 2026-05-15 demo-500). Tests that touch multiple tables, rely on DB
 * constraints, or assert column-level behaviour should use `testDb` instead.
 *
 * The Prisma Dev server is booted once per `vitest run` by
 * `vitest.global-setup.ts`; this module just hands out a client pointed at it.
 *
 * See `docs/TESTING.md` for when to mock vs use the real DB.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

export const TEST_DATABASE_URL =
  'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable'

let _client: PrismaClient | null = null

export function getTestDb(): PrismaClient {
  if (_client) return _client
  _client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  })
  return _client
}

/**
 * Tables that hold per-test fixture data. TRUNCATE … RESTART IDENTITY CASCADE
 * is faster than per-table DELETE and resets the autoincrement sequences so
 * tests can rely on `id: 1` being the first row they create.
 *
 * Keep in sync with `prisma/schema.prisma`. If a new model lands without being
 * added here, tests in the new table will leak across cases.
 */
const ALL_TABLES = [
  'Comparison',
  'Photo',
  'Item',
  'CollectionMembership',
  'CollectionInvite',
  'Collection',
  'VerificationToken',
  'Session',
  'Account',
  'User',
] as const

export async function resetTestDb(): Promise<void> {
  const db = getTestDb()
  const list = ALL_TABLES.map((t) => `"${t}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

export async function disconnectTestDb(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = null
  }
}
