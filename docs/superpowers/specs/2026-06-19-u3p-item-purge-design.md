# Item purge + remove-from-sorts (purses-u3p) — design (rev-3)

**Date:** 2026-06-19 (rev-3 — adds the owner-decided "remove from all sorts" companion op; folds the Security/Data re-reviews)
**Bead:** purses-u3p (P2 bug). **Branch:** `fix/u3p-item-purge`.

## Why

`POST /api/items/[id]/purge` is a no-op stub that returns a **false** `200 "purged successfully"` (PR #204 audit). Build the real **permanent** purge (§11.4 / decision-13): owner-only hard-delete of the item + its dependent rows + blobs. Purge **blocks (409)** when the item is part of any sort result (owner decision — preserves all results, consistent with finalized-immutability `purses-526`/`gmn`). To keep that block from being a dead-end, ship a companion **remove-from-sorts** op that detaches an item from all its **draft** results in one owner call (existing `deleteResultItem` only does one result at a time; finalized stays immutable). prod runs **postgres-js** → real transactions (`withTransaction`, from `purses-nea`).

## Goal & scope

- **A) Item purge:** `POST /api/items/[id]/purge` permanently removes an item, its preference rows, its photo rows (active + soft-deleted) + their blobs — owner-only, confirmed, DB-atomic — OR **409** if any `sort_result_item` references it.
- **B) Remove from sorts (companion):** `POST /api/items/[id]/remove-from-sorts` — owner-only — deletes the item's `sort_result_item` rows that belong to **draft** results (across all curators), in one transaction; leaves **finalized** results untouched and preferences untouched. Lets the owner clear the purge-409 for draft-only items.
- **Out of scope:** `purgeCollection` (separate bead); a purge/remove UI (no caller today — both ops become real but UI-unreachable). No schema change (DELETE/SELECT only).

## The FK reality (the three `items.id` referrers — verified complete)

`items.id` referrers (`schema.ts`), none with `ON DELETE CASCADE`:
- `photos.item_id` (nullable, `:148`) → purge cascade-hard-deletes + blob cleanup.
- `preferences.item_id` (`.notNull()`, `:232`) → purge cascade-hard-deletes (derived triage state).
- `sort_result_items.item_id` (`.notNull()`, `:291`) → purge **blocks 409** if referenced; the remove-from-sorts op deletes the **draft** ones. (`decision_events` does NOT FK to items — it embeds the id in jsonb — so no dangling reference; verified there are no other referrers.)

## A) Purge — approach

### Route — authz BEFORE any body parsing (Security), owner-only, confirm

1. `userId = await requireAuth()` → **401**.
2. Resolve item **including soft-deleted** via `ItemRepository.findByIdIncludingDeleted(params.id)` (`findById` filters `deletedAt`, can't be reused) → **404** if absent.
3. **Owner-only** via `requireApiCollectionOwner(db, item.collectionId, userId)` — collection id sourced ONLY from the resolved `item.collectionId`; owner iff `collection.ownerId === userId`, else **404** (absent collection) / **403**. **No body parsing before this gate** (a non-owner with malformed JSON → 403, never a 400 oracle).
4. Only now parse `{confirm:"PURGE"}` → **400** on missing/wrong/invalid JSON.
5. `await itemPurgeService.purge(item.id)`; a thrown `ItemInResultError` → **409** (`"Item is part of a sort result — remove it from sorts first (POST /api/items/[id]/remove-from-sorts), or it is in a finalized result and cannot be purged"`).
6. **200** `{ message: "Item purged" }`.

### `ItemPurgeService.purge(itemId)` (a service, not the controller)

```
async purge(itemId) {
  if (await this.sortResultItemRepo.existsByItem(itemId)) throw new ItemInResultError(); // → 409, no tx
  const blobKeys = await withTransaction(this.db, async (tx) => {
    await new CollectionPreferenceItemRepository(tx).deleteByItem(itemId); // NEW method (not `clear`, which is curator-scoped)
    const keys = await new PhotoRepository(tx).hardDeleteByItem(itemId);   // DELETE … RETURNING blob_key, ALL rows (incl. soft-deleted)
    await new ItemRepository(tx).hardDelete(itemId);
    return keys;
  });
  await Promise.allSettled(blobKeys.filter((k) => k.startsWith("http")).map((k) => del(k))); // best-effort, log rejections
}
```

- **Invariant:** inside the tx, only tx-bound repos write. Children-first (preferences + photos before the item — both carry the FK). DB-atomic; blobs best-effort post-commit with the `startsWith("http")` guard (matches `collections/[id]/items/[itemId]/photos/[photoId]/route.ts:48`); orphaned blobs on `del` failure are inert/sweepable. The `sort_result_items.item_id` FK is the backstop for the check-then-delete race (a concurrent result-item → item DELETE `23503` → rollback → 500).

## B) Remove-from-sorts — approach

### Route `POST /api/items/[id]/remove-from-sorts`

1. `requireAuth()` → 401; resolve item (`findByIdIncludingDeleted`) → 404; `requireApiCollectionOwner` → 404/403 (owner-only — this detaches the item from *all* curators' draft results, a collection-owner action). No body required (no confirm — it's reversible-ish: a draft result-item, re-derivable by regenerating the draft).
2. `const { removed, remainingInFinalized } = await sortResultService.removeItemFromDraftResults(item.id)`.
3. **200** `{ removed, remainingInFinalized }` — `removed` = draft result-items deleted; `remainingInFinalized` = how many finalized results still reference it (so the caller knows whether purge will now succeed or is finalized-blocked).

### `removeItemFromDraftResults(itemId)` (on `SortResultService`, which owns sort-result-item mutations)

```
async removeItemFromDraftResults(itemId) {
  return withTransaction(this.db, async (tx) => {
    const repo = new SortResultItemRepository(tx);
    const removed = await repo.deleteByItemInDraftResults(itemId);          // DELETE … WHERE item_id=$1 AND sort_result_id IN (SELECT id FROM sort_results WHERE status='draft')
    const remainingInFinalized = await repo.countByItemInFinalizedResults(itemId);
    return { removed, remainingInFinalized };
  });
}
```

- Leaves **finalized** result-items and **preferences** untouched (preferences aren't a purge blocker; this op targets only the result-membership that blocks purge). Removing an item may leave a draft result with fewer (or zero) items — an empty draft is harmless (owner can `deleteResult` it). Single transaction; small N.

## New methods

- DAL: `requireApiCollectionOwner(db, collectionId, userId): Promise<Collection | NextResponse>`.
- `IItemRepository`: `findByIdIncludingDeleted(id)`; `hardDelete(id)`.
- `IPhotoRepository`: `hardDeleteByItem(itemId): Promise<string[]>` (`DELETE … RETURNING blob_key`, all rows).
- `ICollectionPreferenceItemRepository`: `deleteByItem(itemId): Promise<void>` (**new** — distinct from `clear(collectionId, curatorId)`).
- `ISortResultItemRepository`: `existsByItem(itemId): Promise<boolean>`; `deleteByItemInDraftResults(itemId): Promise<number>`; `countByItemInFinalizedResults(itemId): Promise<number>`. (`sort_result_items` has no `item_id` index — seq scan; N tiny per item; acceptable, no schema change.)

## Error handling

- Purge: 401 / 404 (item or collection) / 403 (non-owner) / 400 (confirm, after authz) / **409** (in a result) / 500 (atomic rollback). Blobs best-effort post-commit.
- Remove-from-sorts: 401 / 404 / 403 (non-owner) / 200. No partial state (transaction).

## Security (vibe-security)

- Both ops **owner-only**, server-resolved (`collections.ownerId`); a member/curator → 403; no body-trusted ids; collection id single-sourced from the resolved item. Purge confirm gate; authz strictly before body parsing.
- **Existence-oracle note (low, convention-inherited):** resolving the item before the owner check yields 404-absent vs 403-exists-not-owner — the same 403/404 surface every `requireApiResultAccess` route already has; item ids are unguessable ULIDs. **Pin the test:** a non-owner targeting a *real* item id gets **403** and a *fake* id gets **404** (documented expectation, matching convention) — not silently "403/404." Not a new vuln; do not special-case.
- **Audit gap (follow-up bead):** a permanent owner-only purge has no who-purged-what log (no audit infra exists anywhere). File a follow-up bead; out of scope here.

## Testing (un-mocked DB integration is authoritative; mock only `@vercel/blob`)

- **Purge — owner, no results:** seed collection + item + ≥2 photos (real `blobKey`s incl. one soft-deleted) + ≥1 preference. Owner purge → 200; assert the item is GONE via **`findByIdIncludingDeleted` null** (the load-bearing *hard*-delete proof — `findById` null is non-distinguishing since it filters `deletedAt`), all photo rows gone (active + soft-deleted), all preference rows gone, `del` called with all http blob keys.
- **Purge — block 409:** item with a `sort_result_item` (generate a result) → owner purge → **409**; item + photos + preferences + the result-item all survive.
- **Purge — authz:** non-owner member → 403 (item survives); absent item → 404; **non-owner targeting a real item + malformed body → 403** (proves authz precedes confirm parsing); owner + missing/wrong confirm → 400 (nothing deleted); unauth → 401.
- **Remove-from-sorts:** seed an item in a **draft** result and (separately) a **finalized** result → owner calls remove-from-sorts → 200 `{ removed: 1, remainingInFinalized: 1 }`; the draft result-item is GONE, the finalized result-item SURVIVES, preferences untouched. Then owner purge → still **409** (finalized). Second case: item in draft results only → remove-from-sorts → `remainingInFinalized: 0` → owner purge → **200** (the full un-block→purge chain). Authz: non-owner → 403.
- **Unit:** `requireApiCollectionOwner`; the new repo methods' signatures; `ItemPurgeService.purge` (existsByItem short-circuit, tx, `del` http-filtered post-commit) and `removeItemFromDraftResults` (draft-only delete, finalized count) — mock repos + Blob; the authoritative removal proofs are the integration tests.

- **Playwright e2e — the ENTIRE removal workflow (required, per the owner).** There is no UI for purge/remove-from-sorts, so these are **API-level** Playwright tests driving the real server via authenticated `page.request` (the harness's established pattern, like `auth.setup.ts`), end-to-end against the prod build + ephemeral Postgres, in a new spec (e.g. `e2e/item-removal.spec.ts`). A new e2e seed fixture sets up: an **owner** + a **non-owner** user, a collection, an item with photos, and that item placed in a **draft** result and in a **finalized** result. Cases:
  1. **Full un-block → purge chain** (item in draft-only results): `POST …/purge` → **409**; `POST …/remove-from-sorts` → **200** `{ removed≥1, remainingInFinalized: 0 }`; `POST …/purge` → **200**; then `GET` the item → **404** (gone) and its photos endpoint → empty/404 (blobs cleaned).
  2. **Finalized dead-end** (item also in a finalized result): `remove-from-sorts` → `{ removed: 1, remainingInFinalized: 1 }`; `purge` → **409** (the finalized result-item survives).
  3. **Authz:** the **non-owner** gets **403** on BOTH ops, and the item + its results survive.
  These run in CI's `e2e` (Playwright) job (the `src/app/api/**` change triggers it via the paths-filter). The Blob `del` boundary is exercised against the test environment; assert the API-observable outcomes (item 404, photos empty), not the blob store directly.

## Decisions resolved
- Purge **blocks 409 on any result membership**; the companion **remove-from-sorts** clears draft results (owner choice). Finalized-result items remain non-purgeable by design.
- **The entire removal workflow has Playwright (API-level) e2e coverage** (owner directive) — the un-block→purge chain, the finalized dead-end, and authz.
- Both ops owner-only; orchestration in `ItemPurgeService` (purge) + `SortResultService.removeItemFromDraftResults`.
- `findByIdIncludingDeleted` firm; authz-before-confirm; blob `http` guard; `deleteByItem` is a new method (not `clear`). Audit-log gap → follow-up bead.

## Advances
Closes `purses-u3p`. Reuses `withTransaction` (purses-nea). Companion op complements `deleteResultItem` (single-result) with a bulk draft detach.
