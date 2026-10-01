# u3p — Item Purge + Remove-from-Sorts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make `POST /api/items/[id]/purge` a real owner-only permanent purge (hard-delete item + preferences + photos + blobs, atomic; 409 if in any sort result), and ship the companion `POST /api/items/[id]/remove-from-sorts` (owner-only bulk-detach from DRAFT results), with the entire removal workflow covered by Playwright e2e.

**Architecture:** A new owner-only DAL gate; six new hard-delete/scan repo methods; `ItemPurgeService` (transaction + best-effort blobs) and `SortResultService.removeItemFromDraftResults` (transaction); two routes; un-mocked DB integration + API-level Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-19-u3p-item-purge-design.md` (rev-4, reviewed — purge CLEAN, companion folded).

## Global Constraints
- Commit on `fix/u3p-item-purge`; never touch main. graphify-first. Don't commit `.claude/settings.json`/`graphify-out/`.
- TDD: failing test first, run + confirm RED, then minimal code. Avoid mocking — the authoritative proofs are the un-mocked DB integration tests + the Playwright workflow. Mock ONLY `@vercel/blob`'s `del` (external boundary).
- **Both ops owner-only** (`requireApiCollectionOwner`, server-resolved `collection.ownerId === userId`); **authz strictly before any request-body parsing** (a non-owner with malformed JSON → 403, never 400).
- Purge: **409** if any `sort_result_item` references the item (`existsByItem`); else children-first hard-delete (preferences + photos before item, FK has no cascade) in `withTransaction`; blobs `del`'d best-effort post-commit, filtered by `startsWith("http")`, failures logged not fatal.
- remove-from-sorts: deletes only **draft** result-items (a deliberate, documented t9l exception — owner purge-prep); never touches finalized results or preferences.
- Inside any transaction, only tx-bound repos write. No schema change.

---

### Task 1: `requireApiCollectionOwner` DAL gate

**Files:** `src/server/dal/collection-access.ts` (+ a unit test, mirroring any existing collection-access test).

**Produces:** `requireApiCollectionOwner(db, collectionId, userId): Promise<Collection | NextResponse>` — resolves the collection (404 absent), returns it iff `collection.ownerId === userId`, else 403. Mirrors `requireApiCollectionAccess`'s shape but owner-only.

- [ ] **Step 1 (RED):** unit test — owner → returns Collection; a member-not-owner → 403 NextResponse; non-member → 403; absent collection → 404. Run; FAILS (fn missing).
- [ ] **Step 2 (GREEN):** implement (reuse `CollectionRepository.findById`; check `collection.ownerId === userId`).
- [ ] **Step 3:** run the test (green); commit `feat(dal): requireApiCollectionOwner owner-only gate`.

---

### Task 2: Repository methods + interfaces

**Files:** the interfaces (`src/server/repositories/*Repository.ts`) + impls (`.../implementations/*`) + focused unit tests where they exist.

**Produces:**
- `IItemRepository`: `findByIdIncludingDeleted(id): Promise<Item | null>` (no `deletedAt` filter); `hardDelete(id): Promise<void>` (`DELETE FROM items WHERE id`).
- `IPhotoRepository`: `hardDeleteByItem(itemId): Promise<string[]>` (`DELETE FROM photos WHERE item_id=$1 RETURNING blob_key`; ALL rows, no `deletedAt` filter).
- `ICollectionPreferenceItemRepository`: `deleteByItem(itemId): Promise<void>` (`DELETE FROM preferences WHERE item_id=$1`) — **new**, distinct from the curator-scoped `clear`.
- `ISortResultItemRepository`: `existsByItem(itemId): Promise<boolean>` (`SELECT 1 … WHERE item_id=$1 LIMIT 1`); `deleteByItemInDraftResults(itemId): Promise<number>` (`DELETE FROM sort_result_items WHERE item_id=$1 AND sort_result_id IN (SELECT id FROM sort_results WHERE status='draft')`, return affected count); `countByItemInFinalizedResults(itemId): Promise<number>` (count where the parent result status='finalized').

- [ ] **Step 1:** Read the impls + confirm `findById` filters `deletedAt`, `delete`→softDelete, `clear` is curator-scoped (so the new methods are genuinely new). graphify-first.
- [ ] **Step 2:** Add the interface signatures + implement each (Drizzle; mirror existing `eq`/`and`/`inArray`/subquery patterns). These are thin DB methods — their **authoritative** coverage is the integration tests in Tasks 3/4; add a focused unit only where the repo already has a unit-test file (e.g. an alloc-style test).
- [ ] **Step 3:** `npm run test:ci` (no regressions) + `npx tsc --noEmit` clean on touched files. Commit `feat(repo): hard-delete + draft/finalized result-item scan methods for purge`.

---

### Task 3: Purge — service + route + un-mocked integration

**Files:** create `src/server/services/ItemPurgeService.ts` (+ an `ItemInResultError`); modify `src/app/api/items/[id]/purge/route.ts`; remove the `ItemController.purgeItem` stub (`src/server/api/items.ts`); create `src/lib/db/item-purge.integration.test.ts`.

**Interfaces consumed:** Task 1 gate; Task 2 repos; `withTransaction`; `del` from `@vercel/blob`.

- [ ] **Step 1 (RED — un-mocked purge proof):** in `item-purge.integration.test.ts` (`describeDb`, mock ONLY `@vercel/blob` `del` + `@/lib/auth`), seed a collection (owner) + item + ≥2 photos (real `blobKey`s incl. one soft-deleted) + ≥1 preference; drive the real purge route as **owner** with `{confirm:"PURGE"}`; assert **`ItemRepository.findByIdIncludingDeleted(itemId)` is null** (hard delete), all photo rows gone, all preference rows gone, `del` called with all http blob keys. Run `npm run test:db -- item-purge`. Expected: FAIL (stub no-ops).
- [ ] **Step 2 (RED — 409 + authz):** add integration cases: item with a `sort_result_item` → owner purge → **409**, everything survives; a **non-owner member** → 403 (item survives); absent item → 404; **non-owner + malformed body → 403** (authz precedes confirm parsing); owner + missing confirm → 400 (nothing deleted). Run; FAIL.
- [ ] **Step 3 (GREEN):** implement `ItemPurgeService.purge(itemId)` per the spec (existsByItem→`ItemInResultError`; `withTransaction`{ tx-bound `deleteByItem` (prefs) → `hardDeleteByItem` (photos, returns keys) → `hardDelete` (item) }; post-commit `Promise.allSettled(keys.filter(http).map(del))`). Rewrite the route: `requireAuth` → `findByIdIncludingDeleted` (404) → `requireApiCollectionOwner` (404/403) → parse `{confirm:"PURGE"}` (400) → `service.purge` (map `ItemInResultError`→409) → 200. Remove the controller stub.
- [ ] **Step 4 (GREEN):** run `npm run test:db -- item-purge` (all pass) + `npm run test:ci`. Commit `feat(items): real owner-only item purge — hard-delete + blobs, 409 if in a result (purses-u3p)`.

---

### Task 4: Remove-from-sorts — service + route + un-mocked integration

**Files:** modify `src/server/services/SortResultService.ts` (add `removeItemFromDraftResults` + `db` already added by nea — confirm the service has `db`); create `src/app/api/items/[id]/remove-from-sorts/route.ts`; add cases to `src/lib/db/item-purge.integration.test.ts` (or a sibling).

- [ ] **Step 1 (RED — un-mocked):** integration cases: an item in BOTH a draft and a finalized result → owner `POST …/remove-from-sorts` → **200** `{ removed: 1, remainingInFinalized: 1 }`; the **draft** result-item is GONE, the **finalized** one SURVIVES, preferences untouched. An item in draft-only results → `{ removed≥1, remainingInFinalized: 0 }`. Non-owner → 403. Run `npm run test:db`; FAIL (route/method missing).
- [ ] **Step 2 (GREEN):** `SortResultService.removeItemFromDraftResults(itemId)` = `withTransaction`{ `deleteByItemInDraftResults` + `countByItemInFinalizedResults` } → `{ removed, remainingInFinalized }`. Route `POST /api/items/[id]/remove-from-sorts`: `requireAuth` → `findByIdIncludingDeleted` (404) → `requireApiCollectionOwner` (404/403) → `service.removeItemFromDraftResults` → 200 with the counts. (No confirm body — consistent with `deleteResultItem`.)
- [ ] **Step 3 (GREEN):** run `npm run test:db` + `npm run test:ci`. Commit `feat(items): remove-from-sorts — owner bulk-detach an item from draft results (purses-u3p)`.

---

### Task 5: Playwright e2e — the entire removal workflow

**Files:** `e2e/fixtures/seed.ts` (add `seedRemovalScenario`); an auth helper (e.g. `e2e/fixtures/api-auth.ts` — `apiContextFor(user)`); create `e2e/item-removal.spec.ts`.

- [ ] **Step 1:** Read `e2e/auth.setup.ts` (the credentials-login flow), `e2e/fixtures/seed.ts` (existing seed helpers; all make drafts), `playwright.config.ts` (the single shared storageState), and how `sort-results-authz.integration.test.ts` creates a **finalized** result (`SortResultRepository.create({status:"finalized"})` + `SortResultItemRepository.create`).
- [ ] **Step 2:** Add `seedRemovalScenario` → returns `{ owner, nonOwner, collection, item, photos, draftResult, finalizedResult }`: two real users, a collection owned by `owner`, an item + photos, the item placed in a draft result (item via `SortResultItemRepository.create`) AND a finalized result (status `"finalized"`).
- [ ] **Step 3:** Add `apiContextFor(playwright, user)` → an authenticated `APIRequestContext` (generalize `auth.setup.ts`: `request.newContext()` + POST the NextAuth credentials endpoint to get the session cookie). Verify it can mint TWO distinct user contexts.
- [ ] **Step 4 (RED→GREEN):** `e2e/item-removal.spec.ts` (uses owner + nonOwner contexts):
  - **(1) un-block→purge chain** (draft-only variant of the scenario, or remove finalized first): owner `purge` → 409; owner `remove-from-sorts` → 200 `{ remainingInFinalized: 0 }`; owner `purge` → 200; owner `GET /api/.../items/[number]` (or the item route) → 404; the item's photos endpoint → empty/404.
  - **(2) finalized dead-end:** owner `remove-from-sorts` → `{ removed:1, remainingInFinalized:1 }`; owner `purge` → 409.
  - **(3) authz:** `nonOwner` `purge` → 403 and `remove-from-sorts` → 403; the item + results survive.
  Run: `./e2e/fixtures/test-db.sh up` then `DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx playwright test item-removal --project=tablet`. Expected: RED before Tasks 3/4 wired, GREEN after. `./e2e/fixtures/test-db.sh down` when done.
- [ ] **Step 5:** Commit `test(e2e): entire item-removal workflow — purge + remove-from-sorts (purses-u3p)`.

---

### Task 6: Acceptance gate
- [ ] `npm run test:ci` (green) · `npm run test:db` (purge + remove-from-sorts integration green) · `npm run lint` (0 errors) · `npm run build` · `grep -rn "it\.fails\|test\.fails\|test\.fixme" src e2e` → none.
- [ ] Full Playwright `item-removal` spec green (all 3 cases) against the prod build + ephemeral DB.

## Self-Review
- **Spec coverage:** owner gate (T1), 6 repo methods (T2), purge service+route+409+cascade+blobs+integration (T3), remove-from-sorts service+route+integration (T4), Playwright workflow + the net-new seed/auth infra (T5), gate (T6). ✓
- **Types:** `requireApiCollectionOwner`→`Collection|NextResponse`; `hardDeleteByItem`→`string[]`; `removeItemFromDraftResults`→`{removed,remainingInFinalized}`; `existsByItem`→`boolean`. ✓
- **Placeholders:** each step names files, the RED trigger, the run command. ✓
