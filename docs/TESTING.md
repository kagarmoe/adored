# Testing

> **Core rule:** if a test for an action or lib that touches Prisma can be
> written to fail when the real Postgres schema drifts, write it that way. Use
> `vi.mock('@/lib/db')` only when the test is genuinely a unit test that has
> nothing to do with database shape.

## Why this rule exists

On **2026-05-15** a column-rename landed in code without a matching schema
migration. Every action 500'd in production. The test suite was green because
every action test had been written as:

```ts
const mockDb = vi.hoisted(() => ({ collection: { create: vi.fn() } }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
```

A mocked Prisma client has whatever columns the test pretends it has. There is
no way for that pattern to notice a real-schema drift. The mock _will_ pass
even when the corresponding production query 500s. (See bead **purses-chh.3**.)

## The two patterns

### Real test DB (the default for action/lib tests)

```ts
import { describe, it, beforeEach, afterAll } from 'vitest'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'
import { createCollection } from '@/actions/collections'

const db = getTestDb()
afterAll(disconnectTestDb)
beforeEach(resetTestDb)

it('persists a collection owned by the session user', async () => {
  const owner = await db.user.create({ data: { email: 'a@b.com', name: 'A' } })
  // …drive the action, then assert on the DB row.
})
```

How it works:

- `vitest.global-setup.ts` boots a local **Prisma Dev** server (an in-process
  pglite-backed Postgres — no Docker, no native install) and runs
  `prisma db push` to apply the current `prisma/schema.prisma`.
- `vitest.setup.ts` pins `process.env.DATABASE_URL` to the test server, so the
  production `@/lib/db` module connects to it without any mocking.
- `resetTestDb()` TRUNCATEs every table with RESTART IDENTITY before each
  test. Tests can rely on `id: 1` being the first row they create.
- `fileParallelism: false` in `vitest.config.ts` keeps test files from racing
  on those truncates.

Only mock `@/auth` (sessions) and `next/cache` (revalidatePath). Anything
involving Prisma should hit the real test DB.

### Pure mock (when the test is genuinely schema-free)

Appropriate for:
- Tests where the DB call is a single `findUnique` whose only assertion is
  "we passed the right `where`" — and the same query is exercised end-to-end
  by an action-level real-DB test elsewhere.
- Tests where DB access is incidental to the logic under test (route
  redirects, page-component branching).
- The seam test in `__tests__/auth-send-flow.test.ts`, which mocks the DB to
  drive the real @auth/core handler — the contract under test is the handler,
  not the schema.

If you write a new mock, comment **why** the mock is right for this case.

## Audit (every `vi.mock('@/lib/db')` site as of purses-chh.3)

| File | Decision | Rationale |
|---|---|---|
| `__tests__/auth-send-flow.test.ts` | **(a) keep mock** | Seam test for @auth/core's send-token flow. The schema isn't under test; the callback wiring is. Already the minimal-mock model. |
| `lib/__tests__/auth-callbacks.test.ts` | **(a) keep mock** | Each test asserts a single boolean from a callback; the one `findUnique` is exercised end-to-end by `auth-send-flow.test.ts`. |
| `lib/__tests__/auth-adapter.test.ts` | **(b) convert** *(deferred)* | PurseAdapter's whole job is to translate adapter ↔ Prisma; mocking the Prisma layer means we're asserting string equality on call args. Real DB catches User column renames. Tracked in **purses-cw2**. |
| `lib/__tests__/authz.test.ts` | **(b) convert** ✅ | Hierarchical role gate is the entire auth story for collections/items; runs against the real CollectionMembership composite key + Item FK. |
| `lib/__tests__/invites.test.ts` | **(b) convert** ✅ | Two-step write (membership upsert + invite update). Real DB enforces the (collectionId, userId) composite unique that makes the upsert idempotent. |
| `lib/__tests__/actions/collections.test.ts` | **(b) convert** ✅ | Owner-connect + membership-create flow — exactly where the 2026-05-15 drift bit. |
| `lib/__tests__/actions/items.test.ts` | **(b) convert** ✅ | create/update against the real schema validates required columns (e.g. eloRating default = 1000 — load-bearing for lib/elo). |
| `lib/__tests__/actions/curators.test.ts` | **(b) convert** *(deferred)* | invite + membership upsert + email side effect; keep `@/lib/email` mocked. Tracked in **purses-cw2**. |
| `lib/__tests__/actions/photos.test.ts` | **(b) convert + keep blob mock** *(deferred)* | Photo schema (bgRemoved + originalBlobKey columns) is exactly the kind of drift we want to catch. Keep `@vercel/blob` mocked. Tracked in **purses-cw2**. |
| `lib/__tests__/actions/ranking.test.ts` | **(b) convert** *(deferred)* | Currently mocks `db.$transaction` directly — the most untrustworthy mock in the suite. Real DB validates the Item ↔ Comparison FK chain. Tracked in **purses-cw2**. |
| `app/(operator)/collections/[id]/__tests__/page.test.tsx` | **(a) keep mock** | Page test asserts redirect / notFound branches; DB layer is covered by action tests. |
| `app/(operator)/collections/[id]/upload/__tests__/page.test.tsx` | **(a) keep mock** | Same — routing-focused. |
| `app/(curator)/__tests__/page.test.tsx` | **(a) keep mock** | Post-auth router. Routes-focused. |

**Status at end of purses-chh.3:** 4 of 6 "convert" sites done + new
`lib/__tests__/schema-drift.test.ts`. Remaining 4 deferred into
**purses-cw2** with the infrastructure already in place.

## Schema-drift suite

`lib/__tests__/schema-drift.test.ts` is the explicit demonstration of the
class of bug a mocked DB cannot catch. It pins:
- `Photo.bgRemoved` and `Photo.originalBlobKey` round-trip with the values
  the upload action writes (migration 20260509060000).
- `Photo.originalBlobKey` unique index (migration 20260509070000).
- `CollectionMembership` composite unique on `(collectionId, userId)`
  (migration 20260514220000).
- `Collection.rankingCompletedAt` default-null + accepts a Date.

If any of these columns are renamed/dropped without a matching code change,
this suite fails before the change can ship.

## Operating the test DB

```bash
npm test                                  # idempotently starts server + pushes schema + runs vitest
npx prisma dev ls                         # list running pglite servers
npx prisma dev stop purse-test            # stop (DATABASE_URL=postgres://dummy works for any prisma dev cmd)
```

The server runs on `localhost:51214` (Prisma Dev's default DB port). It is
intentionally **not** stopped between `vitest run` invocations — keeping it
running is what makes the next run start fast.

## Don'ts

- **Don't `vi.mock('@/lib/db')` for new tests** unless one of the "(a) keep
  mock" rationales above applies, and document _which_ in a comment.
- **Don't mock `db.$transaction`.** A mocked transaction tells you nothing.
  Use the real test DB and let Prisma actually run the transaction.
- **Don't add a column to `prisma/schema.prisma` without adding the
  corresponding handwritten migration in `prisma/migrations/`.** See
  `infra.yaml` — migrations are hand-applied to Neon. The test DB uses
  `prisma db push` against the schema, so the schema is the source of truth
  for tests; production needs the SQL written separately.
- **Don't add a model without adding it to `ALL_TABLES` in
  `lib/test-db.ts`.** Without that, `resetTestDb()` won't truncate it and
  fixtures will leak across tests.
