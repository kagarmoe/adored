# Transactional result materialization (purses-nea) — design (rev-2)

**Date:** 2026-06-19 (rev-2 — folds the Data/Persistence + Architect spec reviews)
**Bead:** purses-nea (P3 bug). **Branch:** `fix/nea-transactional-materialization`.

## Why

`SortResultService.createDraftResult` materializes a draft by writing the `sort_results` row, then one `sort_result_items` row per curator preference, as **N sequential, independent writes** with no atomicity. A failure partway leaves a **partial draft** (a result with some-but-not-all items) plus a propagated error. `supersedeResult` clones a finalized result's items the same way (same risk).

This was deferred during #208 on the stale belief that "the codebase has no transactions." **It's stale:** `src/lib/db.ts` uses `drizzle-orm/postgres-js` over a `postgres` TCP client, which fully supports interactive transactions; `src/lib/transactions.ts` exports `withTransaction(db, cb)` (zero callers today). The review confirmed at the driver level that `db.transaction(async (tx) => …)` works on this stack.

## Goal & scope

- **Goal:** `createDraftResult` and `supersedeResult` write the result row + all item rows **atomically** — a mid-materialization failure leaves **no** result and **no** items.
- **In scope:** the two multi-INSERT materialization paths in `SortResultService`.
- **Out of scope:** `deleteResult` (children-first delete; a mid-delete failure leaves a *recoverable empty result*, not orphans — filed as a separate follow-up bead, NOT done here). No schema change. No happy-path behavior change.
- Corrects the stale `// neon-http is stateless — no long transaction` comments in `SortResultRepository.ts`.

## Approach

### Separate the PURE computation from the transactional write (resolves the Architect BLOCK)

The materialization is split into a **pure, unit-testable** step and a **transactional, integration-tested** write, so the unit tests never need to observe writes that happen on tx-bound repos:

- `rankPreferencesToItems(preferences): { itemId, computedRank, computedBucket }[]` — **pure** (sort by `score` desc; `computedRank = index`; `computedBucket = pref.rankBucket`). No DB. Unit-tested directly.
- `cloneItemsFrom(items): { itemId, computedRank, computedBucket }[]` — **pure** (copy `computedRank`/`computedBucket`; `SortResultItemRepository.create` already hard-codes `manualRank/manualBucket = null`, so the shape matches create exactly). Unit-tested directly.
- `createResultWithItems(collectionId, curatorId, name, items): Promise<SortResult>` — the **one transactional primitive** (below), reused by both create and supersede. Proven by the un-mocked integration test, not unit mocks.

### Service gets transaction capability (constructor change)

`SortResultService` gains `db: Database` as a 4th constructor param (alongside the existing repos):

```
constructor(sortResultRepo, sortResultItemRepo, preferenceRepo, db: Database) {}
```

The injected repos serve **reads** (`preferenceRepo.findByCollection`, `sortResultRepo.findById`/`findByResult`) and the non-materialization methods. `db` is used **only** to open the transaction. **Invariant (must hold + is enforced by the rollback test):** inside `createResultWithItems`, writes go ONLY to tx-bound repos (`new SortResultRepository(tx)` / `new SortResultItemRepository(tx)`) — NEVER `this.sortResultRepo`/`this.sortResultItemRepo` (a leaked non-tx write would not roll back). Every route that builds the service (POST `sort-results`, `[id]/supersede`) already has `db` in scope → passes it 4th.

### `createDraftResult`

```
async createDraftResult(collectionId, curatorId, name) {
  const prefs = await this.preferenceRepo.findByCollection(collectionId, curatorId); // read, pre-tx
  const items = rankPreferencesToItems(prefs);                                       // PURE
  return this.createResultWithItems(collectionId, curatorId, name, items);           // TX
}
```

### `createResultWithItems` (the transactional primitive) + the number race

`SortResultRepository.create` today allocates `MAX(number)+1` and **recomputes the number on every retry attempt** (`SortResultRepository.ts:33` — `getNextResultNumber` is inside the loop), retrying on `23505` up to 5×. A failed INSERT aborts a Postgres transaction, so the retry cannot live *inside* one attempt — **retry the whole transaction, recomputing the number each attempt**:

```
async createResultWithItems(collectionId, curatorId, name, items) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await withTransaction(this.db, async (tx) => {
        const resultRepo = new SortResultRepository(tx);
        const itemRepo = new SortResultItemRepository(tx);
        const number = await resultRepo.getNextResultNumber(collectionId);  // recomputed EACH attempt
        const result = await resultRepo.insertWithNumber({ collectionId, curatorId, name, status: "draft", number });
        for (const it of items) await itemRepo.create({ sortResultId: result.id, ...it });
        return result;
      });
    } catch (e) {
      if (isResultNumberConflict(e) && attempt < 4) continue;   // EXACT predicate, not bare 23505
      throw e;
    }
  }
  throw new ResultNumberExhaustedError();   // distinct from a mid-tx failure (see Error handling)
}
```

- **Repo refactor:** split today's `create` into `getNextResultNumber` (already public) + **`insertWithNumber({…, number})`** (one INSERT, caller-supplied number, **no** internal retry). Keep the existing `create` as a thin wrapper = `for attempt { number = getNextResultNumber(); try insertWithNumber({…, number}) catch isResultNumberConflict → continue }` — i.e. it still **recomputes `getNextResultNumber` every attempt**, preserving today's behavior exactly. `isResultNumberConflict` is exported and is the **single** predicate used by both `create` and `createResultWithItems` (so the two retry sites can't drift).
- **Decision (was open #2): keep `getNextResultNumber` INSIDE the tx.** Moving allocation outside the tx widens the read→insert race window and splits the atomic unit. In-tx MAX+1 + whole-tx retry converges (a fresh tx sees the committed number and picks the next). `number` stays per-collection (a global sequence doesn't fit without a per-collection counter table — out of scope, no schema change).

### `supersedeResult` (atomic clone — explicit wiring, resolves Data F4)

```
async supersedeResult(id) {
  const source = await this.sortResultRepo.findById(id);          // read, pre-tx
  if (!source) return null;                                       // → route 404
  if (source.status !== "finalized") throw new SupersedeStateError(); // → route 409
  const sourceItems = await this.sortResultItemRepo.findByResult(id); // read, pre-tx (source is immutable)
  const items = cloneItemsFrom(sourceItems);                      // PURE
  return this.createResultWithItems(source.collectionId, source.curatorId, `${source.name} (Revision)`, items); // TX
}
```

`supersedeResult` performs **no writes outside** `createResultWithItems` — it only reads (guard + source items, both pre-tx; the source is finalized/immutable so the read-then-write window is benign) and hands a plain data array to the primitive. The finalized-only guard and `null`-on-absent behavior are unchanged.

## Connection & pooling — prod is Neon PgBouncer (resolves Data F1)

Prod routes `DATABASE_URL` through a Neon **`-pooler`** (PgBouncer, transaction mode) endpoint; `src/lib/db.ts` is bare `postgres(connectionString)`. This is **safe for interactive transactions**: postgres-js `begin()` **pins one dedicated connection** for the whole `BEGIN…COMMIT`, which PgBouncer transaction-pooling keeps assigned for the transaction's duration — the multi-statement transaction is exactly the unit PgBouncer supports. The known PgBouncer hazard is *prepared-statement reuse across separate pooled connections*, not multi-statement transactions; the app already issues prepared statements through this pooled endpoint today without failing (Neon PgBouncer ≥1.21 supports named prepared statements in transaction mode), and a pinned-connection transaction is strictly safer. **Decision: do NOT add `prepare: false` to `db.ts`** (it's a global change for a single new path; the app already coexists with this pooler) — but if prepared-statement errors ever surface under the new transactions, `prepare: false` on the postgres client is the one-line fix.

**Cost acknowledgment:** a transaction holds a pooled connection for `1 + N` writes (N = preference count), so materialization is more connection-hungry than today's autocommit writes (which release between statements). N is small for a single curator's draft; acceptable. **Test transport caveat:** the rollback integration test runs against the **non-pooled** local container (`e2e/fixtures/db.ts`), so it proves transaction *logic*, not the prod PgBouncer transport — which the reasoning above covers.

## Error handling

- Any failure inside the transaction (a failed item INSERT — e.g. `23503` FK, a connection drop) rolls the whole transaction back: no result row, no item rows. The error propagates (→ route 500), but the DB is left clean.
- The `23505` number race is retried at the transaction boundary, gated on the **exact `isResultNumberConflict` predicate** (`code === "23505"` AND message contains `sort_results_collection_number_unique`) — a duplicate-*item* conflict or any other error is **not** retried/masked.
- Number-allocation exhaustion after 5 attempts throws a distinct `ResultNumberExhaustedError` (→ 500) so ops can distinguish "retry storm lost" from "DB fell over" / a mid-tx failure.

## Testing (resolves the Architect BLOCK + Data F3/F5)

- **Unit (pure logic, no DB, no tx):** `rankPreferencesToItems` (ordering by score, rank index, bucket mapping) and `cloneItemsFrom` (computed fields copied, manual fields absent) get direct unit tests. The `supersedeResult` **guard** (finalized→throws `SupersedeStateError`; absent→null) is unit-tested by mocking `findById` on the injected repo. These cover the branchy logic without touching the transaction.
- **Service unit tests — explicitly retire the now-bypassed write assertions.** The existing `SortResultService.test.ts` assertions that inspected `injectedItemRepo.create`/`injectedResultRepo.create` calls for materialization are **removed** (those writes now happen on tx-bound repos the unit test can't observe) and **replaced** by the pure-logic assertions above + the guard. We do NOT leave them silently asserting nothing.
- **Route unit tests — `fakeTxDb` helper.** The route tests mock `getDb`; they now return a `fakeTxDb()` whose `.transaction(async (cb) => cb(fakeTx))` **invokes the callback** (a bare `{}` throws `db.transaction is not a function`). The route files' existing repo-constructor `vi.mock`s already return mock repos for `new SortResultRepository(tx)`, so the materialization "runs" on mocks and the route returns its real status (e.g. supersede 201). Add the small shared `fakeTxDb` test helper.
- **Integration (un-mocked, `RUN_DB_TESTS`, the AUTHORITATIVE tx proof) — in `src/lib/db/sort-pipeline.integration.test.ts` (runs in the CI `db-tests` job):**
  - **Rollback:** drive a `createDraftResult` whose materialization fails mid-way by seeding a preference whose `itemId` does NOT exist in `items` (the `sort_result_items.item_id` FK `23503` fires on an item INSERT *after* the result row + earlier items inserted in the same tx). Assert **collection-scoped emptiness** — `SortResultRepository.findByCollection(collectionId)` returns `[]` AND no `sort_result_items` exist for that collection — i.e. nothing committed. (Do NOT assert on a returned id: the call throws, so there is no id. The `23503` is not `isResultNumberConflict`, so it propagates on attempt 1, not 5× — note this so the test author doesn't expect retries.)
  - **Happy path unchanged:** existing `createDraftResult`/`supersedeResult` integration proofs (populated result, correct items, rank order) stay green.
- **Number-race regression — keep `SortResultRepository.alloc.test.ts`'s three cases green** against the refactored wrapper: (1) happy MAX+1 single insert, (2) retry **AND recompute** the number on `23505` (number 3 → 4), (3) no retry on an unrelated unique violation. This existing suite — not a new "focused" test — is the real guard that the `create`/`insertWithNumber` split preserves recompute-per-attempt.

## Advances

Closes `purses-nea`. Establishes `withTransaction` as the codebase's pattern for multi-row writes (first real use). Follow-up bead filed for `deleteResult` transactional consistency (Data F7).
