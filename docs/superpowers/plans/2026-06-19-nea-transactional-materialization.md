# nea — Transactional Result Materialization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make `SortResultService.createDraftResult` + `supersedeResult` write the result row + all item rows atomically via `withTransaction`, so a mid-materialization failure leaves nothing committed.

**Architecture:** Extract pure ranking/clone logic (unit-tested); a single `createResultWithItems` transactional primitive (`withTransaction` + whole-tx retry on the number race) does the atomic write (integration-tested); the service gains a `db` constructor param.

**Spec:** `docs/superpowers/specs/2026-06-19-nea-transactional-materialization-design.md` (rev-2, reviewed CLEAN).

## Global Constraints
- Commit on branch `fix/nea-transactional-materialization`; never touch main.
- graphify-first before reading source. Don't commit `.claude/settings.json` / `graphify-out/`.
- TDD: failing test first, run it, confirm RED, then minimal code. Avoid mocking — the authoritative atomicity proof is the un-mocked DB integration rollback test.
- **Invariant:** inside `createResultWithItems`, writes use ONLY tx-bound repos (`new SortResultRepository(tx)` / `new SortResultItemRepository(tx)`), never `this.sortResultRepo`/`this.sortResultItemRepo`.
- The retry predicate is the **single exported `isResultNumberConflict`** (`code==="23505"` AND message includes `sort_results_collection_number_unique`) — used by both `create` and `createResultWithItems`. Number-allocation exhaustion → a distinct `ResultNumberExhaustedError`.
- prod is Neon PgBouncer (pooled); postgres-js pins one connection per tx → safe. Do NOT add `prepare:false`.

---

### Task 1: Repo refactor — `insertWithNumber` split (preserve recompute-per-attempt)

**Files:** `src/server/repositories/implementations/SortResultRepository.ts`; `src/server/repositories/SortResultRepository.ts` (interface); `src/server/repositories/implementations/SortResultRepository.alloc.test.ts`.

**Produces:** `getNextResultNumber(collectionId)` (already public); `insertWithNumber({collectionId,curatorId,name,status,number}): Promise<SortResult>` (single INSERT, caller-supplied number, **no** internal retry); exported `isResultNumberConflict(error): boolean`; `create` kept as a thin wrapper that **recomputes `getNextResultNumber` each attempt** + retries on `isResultNumberConflict`.

- [ ] **Step 1:** Read `SortResultRepository.ts` (impl) + `SortResultRepository.alloc.test.ts`. Confirm `alloc.test.ts` asserts: happy MAX+1 single insert; retry **AND recompute** number 3→4 on `23505`; no retry on an unrelated unique violation.
- [ ] **Step 2 (RED-ish — keep existing green + add a focused test):** Add a unit test `insertWithNumber inserts a single row with the given number and does NOT retry on 23505 (propagates)`. Run `npx vitest run src/server/repositories/implementations/SortResultRepository.alloc.test.ts` — the new test FAILS (method doesn't exist).
- [ ] **Step 3 (GREEN):** Extract `insertWithNumber` (the single INSERT currently inside the retry loop, minus the retry). Re-implement `create` as: `for attempt<5 { const number = await this.getNextResultNumber(collectionId); try { return await this.insertWithNumber({...,number}); } catch(e){ if (isResultNumberConflict(e) && attempt<4) continue; throw e; } }`. Export `isResultNumberConflict`. Add `insertWithNumber` to `ISortResultRepository`.
- [ ] **Step 4:** Run `npx vitest run ...alloc.test.ts` — ALL green (the 3 existing cases + the new one). The existing 3 cases prove `create` still recomputes-per-attempt.
- [ ] **Step 5:** Add a `ResultNumberExhaustedError` class (e.g. in the service errors module alongside `SupersedeStateError`/`DeleteResultStateError`).
- [ ] **Step 6:** Commit: `refactor(repo): split SortResultRepository.create into insertWithNumber + retry wrapper (export isResultNumberConflict)`.

---

### Task 2: Pure ranking/clone functions

**Files:** `src/server/services/SortResultService.ts` (or a small sibling `sortResultMaterialization.ts`); a new unit test.

**Produces:** `rankPreferencesToItems(preferences): {itemId,computedRank,computedBucket}[]` (sort by `score` desc; `computedRank=index`; `computedBucket=pref.rankBucket`); `cloneItemsFrom(items): {itemId,computedRank,computedBucket}[]` (copy computed fields).

- [ ] **Step 1 (RED):** Write a unit test: `rankPreferencesToItems sorts by score desc, assigns 0-based rank, maps rankBucket` (e.g. prefs with scores [0.6,0.9,0.3] → ranks/order correct, buckets preserved) and `cloneItemsFrom copies computedRank/computedBucket and omits manual fields from the create-input`. Run it — FAILS (functions don't exist).
- [ ] **Step 2 (GREEN):** Implement both as pure functions (no repo/db handle). Confirm the mapping matches the current inline logic in `createDraftResult`.
- [ ] **Step 3:** Run the test — green. Commit: `feat(sort): extract pure rankPreferencesToItems + cloneItemsFrom`.

---

### Task 3: Transactional materialization — primitive + service rewire + tests

**Files:** `src/server/services/SortResultService.ts` (+ its test); `src/app/api/sort-results/route.ts`, `[id]/route.ts`, `[id]/supersede/route.ts`, `[id]/items/[rid]/route.ts` (+ their tests); a shared `fakeTxDb` test helper (e.g. `src/test-support/fakeTxDb.ts` or inline per the existing test conventions).

**Interfaces consumed:** `withTransaction(db, cb)`; Task 1's `insertWithNumber`/`isResultNumberConflict`/`ResultNumberExhaustedError`; Task 2's pure functions.

- [ ] **Step 1 (RED — the load-bearing atomicity test):** In `src/lib/db/sort-pipeline.integration.test.ts` add a `describeDb` test: seed a collection + ONE item + a curator with **two** preferences — one for the real item, one whose `itemId` is a fabricated non-existent id (FK `23503` will fire on its item INSERT). Call `createDraftResult`; expect it to **throw**. Then assert `SortResultRepository.findByCollection(collectionId)` returns `[]` AND there are no `sort_result_items` for the collection (collection-scoped emptiness — do NOT reference a returned id). Run `npm run test:db -- sort-pipeline`. Expected: **FAIL** (today's non-tx path leaves the result row + the first item → findByCollection not empty).
- [ ] **Step 2 (GREEN — service):** Add `db: Database` as the 4th constructor param of `SortResultService`. Implement `createResultWithItems(collectionId, curatorId, name, items)` per the spec (the `for attempt<5 { withTransaction(this.db, async tx => { tx repos; number=getNextResultNumber; insertWithNumber; for items itemRepo.create }) } catch isResultNumberConflict→continue; else throw; exhausted→ResultNumberExhaustedError`). Rewire `createDraftResult` (= `findByCollection` → `rankPreferencesToItems` → `createResultWithItems`) and `supersedeResult` (= guard + `findByResult` → `cloneItemsFrom` → `createResultWithItems`, name `"… (Revision)"`), per the spec's pseudocode. Honor the invariant (no injected-repo writes inside the tx).
- [ ] **Step 3:** Update the **four** route call sites to pass `db` 4th (each already has `db`/`getDb()` in scope).
- [ ] **Step 4 (GREEN — rollback):** Run `npm run test:db -- sort-pipeline`. Expected: the rollback test now PASSES (nothing committed) AND the existing happy-path create/supersede integration tests still pass.
- [ ] **Step 5 (route unit tests):** Add the `fakeTxDb()` helper — `{ transaction: async (cb) => cb(fakeTxDb()) }` (its `.transaction` invokes the callback; the route tests' existing repo-constructor `vi.mock`s return the mock repos for `new SortResultRepository(tx)`). In `route.test.ts` + `[id]/supersede/route.test.ts`, change `mockGetDb.mockReturnValue({})` → `mockGetDb.mockReturnValue(fakeTxDb())`. Add the 4th `db` arg where the tests construct the service directly (if any). Run `npx vitest run` on both route test files — green (supersede 201 etc.).
- [ ] **Step 6 (service unit tests):** In `SortResultService.test.ts`: **remove** the assertions that inspected `injectedItemRepo.create`/`injectedResultRepo.create` for materialization (now integration-covered) and **replace** with: the Task-2 pure-logic coverage (already separate) + the `supersedeResult` **guard** (mock `findById` → finalized→`createResultWithItems` reached / non-finalized→throws `SupersedeStateError` / absent→null). Construct the service with a `fakeTxDb()` where a tx is exercised. Do NOT leave any test silently asserting nothing. Run `npx vitest run src/server/services/SortResultService.test.ts` — green.
- [ ] **Step 7:** Fix the stale `// neon-http is stateless — no long transaction` comments in `SortResultRepository.ts`.
- [ ] **Step 8:** `npm run test:ci` green. Commit: `fix(sort): materialize results atomically via withTransaction (purses-nea)`.

---

### Task 4: Acceptance gate

- [ ] **Step 1:** `npm run test:ci` (incl. alloc.test 3 cases, pure-fn tests, service+route unit) — green.
- [ ] **Step 2:** `npm run test:db` — green, incl. the rollback test + the happy-path create/supersede proofs.
- [ ] **Step 3:** `npm run lint` (0 errors) + `npm run build` (green).
- [ ] **Step 4:** `grep -rn "it\.fails\|test\.fails\|test\.fixme" src e2e` → none.
- [ ] **Step 5:** Confirm no stale `neon-http`/`no long transaction` comments remain in the touched repos.

## Self-Review
- **Spec coverage:** pure split (T2), insertWithNumber/predicate/recompute (T1), constructor+primitive+4 routes+rewire (T3), fakeTxDb + retire-bypassed (T3.5/6), rollback collection-scoped + happy green (T3.1/4), PgBouncer (no code change), stale comments (T3.7), exhaustion error (T1.5/T3.2). ✓
- **Type consistency:** `insertWithNumber({collectionId,curatorId,name,status,number})`; `createResultWithItems(collectionId,curatorId,name,items)`; items shape `{itemId,computedRank,computedBucket}` matches `SortResultItemRepository.create`. ✓
- **Placeholders:** every step names files, the exact RED trigger, and the run command. ✓
