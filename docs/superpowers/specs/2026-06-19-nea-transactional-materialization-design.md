# Transactional result materialization (purses-nea) — design

**Date:** 2026-06-19
**Bead:** purses-nea (P3 bug). **Branch:** `fix/nea-transactional-materialization`.

## Why

`SortResultService.createDraftResult` materializes a draft by writing the `sort_results` row, then one `sort_result_items` row per curator preference, as **N sequential, independent writes** with no atomicity. A failure partway (a transient DB error on item *k* of *n*) leaves a **partial draft** — a result with some-but-not-all items — plus a propagated error. `supersedeResult` clones a finalized result's items the same way (same partial-state risk).

This was deliberately deferred during the #208 repair on the belief that "the codebase has no transactions" (ARCHITECTURE.md repeatedly says *"neon-http has no transactions / is stateless"*). **That belief is stale:** `src/lib/db.ts` uses `drizzle-orm/postgres-js` over a `postgres` TCP client — which fully supports interactive transactions — and `src/lib/transactions.ts` already exports `withTransaction(db, cb)` (zero callers today). So the correct fix — a real transaction — is available now.

## Goal & scope

- **Goal:** `createDraftResult` and `supersedeResult` write the result row + all item rows **atomically** — all-or-nothing. A mid-materialization failure leaves **no** result and **no** items (full rollback).
- **In scope:** the two multi-INSERT materialization paths in `SortResultService` — `createDraftResult` and `supersedeResult`.
- **Out of scope:** `deleteResult` (children-first delete; a mid-delete failure leaves a recoverable *empty* result, not orphaned children — wrapping it in a transaction is a reasonable consistency add but is **not** nea's concern; noted for the Data persona to opine, deferred otherwise). The collection-level purge/materialization paths. No schema change. No behavior change to the happy path (same rows written, same return value).
- This also corrects the stale `// neon-http is stateless — no long transaction` comments in `SortResultRepository.ts` that the new code contradicts.

## Approach

### Transaction wrapper

Wrap each materialization in `withTransaction(db, async (tx) => …)`, constructing **tx-bound repositories inside the callback** (`new SortResultRepository(tx)`, `new SortResultItemRepository(tx)`). `tx` is typed `Database` (the `withTransaction` callback param), and the repos already accept a `Database` in their constructor, so a tx-bound repo issues all its statements on the transaction. Reads that precede the writes (`preferenceRepo.findByCollection`) do **not** need the transaction and keep using the injected repo.

### Service gets transaction capability (constructor change)

`SortResultService` currently receives three pre-built repos and has no handle to `db`, so it cannot open a transaction. **Add `db: Database` as a constructor parameter** (alongside the existing repos — *not* replacing them, to preserve the repo-injection the unit tests rely on):

```
constructor(
  private sortResultRepo: ISortResultRepository,
  private sortResultItemRepo: ISortResultItemRepository,
  private preferenceRepo: ICollectionPreferenceItemRepository,
  private db: Database,
) {}
```

The injected repos still serve reads and the non-transactional methods; `db` is used only to open the transaction for the two materialization paths. Every route that constructs the service (POST `sort-results`, `[id]/supersede`) already has `db` in scope — they pass it as the 4th arg. Unit tests that inject mock repos pass a stub `db` (the transaction path is proven by the un-mocked integration test, not the mocked unit tests — see Testing).

### `createDraftResult` (atomic)

```
async createDraftResult(collectionId, curatorId, name): Promise<SortResult> {
  const preferences = await this.preferenceRepo.findByCollection(collectionId, curatorId); // read, pre-tx
  const ranked = preferences.sort((a,b) => b.score - a.score);
  return this.createResultWithItems(collectionId, curatorId, name, ranked.map((p,i) => ({
    itemId: p.itemId, computedRank: i, computedBucket: bucketFor(p),
  })));
}
```

where `createResultWithItems` opens the transaction and writes result + items on `tx`-bound repos.

### The number-allocation race (the one real wrinkle)

`SortResultRepository.create` allocates `MAX(number)+1` and **retries on `23505`** (the `UNIQUE(collection_id, number)` race; up to 5 attempts). Inside a transaction a failed INSERT **aborts the whole transaction**, so the existing retry-*within*-create cannot run inside the tx. Resolution: **retry the whole transaction**, not the insert:

```
async createResultWithItems(collectionId, curatorId, name, items): Promise<SortResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await withTransaction(this.db, async (tx) => {
        const resultRepo = new SortResultRepository(tx);
        const itemRepo = new SortResultItemRepository(tx);
        const number = await resultRepo.getNextResultNumber(collectionId);
        const result = await resultRepo.insertWithNumber({ collectionId, curatorId, name, status: "draft", number });
        for (const it of items) await itemRepo.create({ sortResultId: result.id, ...it });
        return result;
      });
    } catch (e) {
      if (isResultNumberConflict(e) && attempt < 4) continue; // whole-tx retry on the number race
      throw e;
    }
  }
  throw new Error("Could not allocate a result number");
}
```

This requires a small repo refactor: split today's retry-bearing `create` into (a) `getNextResultNumber` (already public) and (b) a **`insertWithNumber({…, number})`** that does a single INSERT with a caller-supplied number and **no internal retry** (the retry now lives at the tx boundary). The existing `create` (internal-retry, used elsewhere/tests) is kept as a thin wrapper over `insertWithNumber` + the retry loop, so non-transactional callers are unaffected. `isResultNumberConflict` is reused (exported).

### `supersedeResult` (atomic clone)

Same pattern: open one transaction that creates the new "(Revision)" draft row **and** clones every item, all-or-nothing. The finalized-only guard (`SupersedeStateError`) and the `null`-on-absent behavior are unchanged; only the write becomes atomic. Reuse `createResultWithItems` (the clone is "create a draft + these items") so there is one transactional materialization primitive.

## Error handling

- Any failure inside the transaction (a failed item INSERT, a connection drop) rolls the whole transaction back: **no result row, no item rows**. The error propagates to the route (→ 500), exactly as today, but now the DB is left clean instead of half-written.
- The `23505` number race is retried at the transaction boundary (bounded, 5 attempts) — preserving today's race-safety. Any other error is not retried.
- Read-before-write: `findByCollection` runs before the tx; if a preference is concurrently deleted between the read and the write, the worst case is an item referencing a now-absent preference's `itemId` — but `itemId` FKs to `items`, not preferences, so this is unaffected (preferences are derived state). No new race introduced.

## Testing (un-mocked is the authoritative proof — postgres-review territory)

- **Rollback (the load-bearing test, DB integration, `RUN_DB_TESTS`):** drive a `createDraftResult` whose materialization fails partway (e.g. seed one preference whose `itemId` violates the `sort_result_items.item_id` FK, OR inject a failing item write), then assert **`SortResultRepository.findById` is null AND `SortResultItemRepository.findByResult` is `[]`** for the attempted result — i.e. nothing was committed. This is the test that proves atomicity and cannot be faked with mocks (it needs a real transaction).
- **Happy path unchanged:** the existing `createDraftResult` / `supersedeResult` integration tests (populated result, correct items, rank order) stay green — same rows, same return.
- **Number-race retry:** keep/adapt the existing `result-number` integration coverage so the whole-tx retry still allocates `MAX+1` under contention.
- **Unit:** the service unit tests keep injecting mock repos (now + a stub `db`); they cover the ranking/guard logic. They do **not** assert the transaction (that is the integration test's job — mocks can't prove rollback). The `insertWithNumber` vs `create` split gets a focused repo unit test.

## Risks / decisions for the Data persona

1. **Tx-bound repo construction inside the callback** — confirm constructing `new SortResultRepository(tx)` and issuing all writes on `tx` is correct drizzle/postgres-js usage and that the injected (non-tx) repos are not accidentally used for any write inside the tx.
2. **Whole-tx retry on `23505`** vs moving number allocation out of the tx — confirm the retry-the-transaction approach is sound (a fresh `getNextResultNumber` each attempt inside the new tx).
3. **Constructor change** (`+db`) vs a repo-factory / repos-accept-tx approach — is adding `db` the least-bad option, or is a `tx`-executor parameter on the repo write methods cleaner?
4. Whether `deleteResult` should also become transactional now for consistency (currently out of scope).

## Advances

Closes `purses-nea`. Establishes `withTransaction` as the pattern for multi-row writes (first real use), correcting the stale "no transactions" assumption.
