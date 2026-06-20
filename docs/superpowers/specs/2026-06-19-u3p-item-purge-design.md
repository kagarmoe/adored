# Item purge — permanent hard-delete + blob cleanup (purses-u3p) — design (rev-2)

**Date:** 2026-06-19 (rev-2 — folds the Security + Data spec reviews + the owner's block-vs-cascade decision)
**Bead:** purses-u3p (P2 bug). **Branch:** `fix/u3p-item-purge`.

## Why

`POST /api/items/[id]/purge` `requireAuth()`s, validates `{confirm:"PURGE"}`, then calls `ItemController.purgeItem()` — an **empty stub that ignores `params.id` and deletes nothing** — yet returns `200 "Item purged successfully."` A success message that does nothing is a data-integrity/UX trap (PR #204 audit). Build the real purge ("the right way").

Purge = the **permanent** tier (infra §11.4 / decision-13): hard-delete the item and its dependent rows + blobs, **owner-only**, confirmed. Today `Item`/`Photo` deletes are **soft only** (no hard delete exists). prod runs **postgres-js** (TCP) → real transactions (`withTransaction`, established by purses-nea); the repos' "neon-http is stateless" comments are stale.

## Goal & scope

- **Goal:** `POST /api/items/[id]/purge` permanently removes an item, its preference rows, its photo rows (active + soft-deleted) and their blobs — owner-only, confirmed, atomic at the DB tier — **OR** refuses with **409** if the item is part of any sort result.
- **In scope:** the route + a new `ItemPurgeService` + the new hard-delete repo methods + an owner-only DAL helper.
- **Out of scope:** `purgeCollection` (separate bead). No UI — purge has **no caller today**; this makes the API real but UI-unreachable (a separate feature). No schema change (DELETE/SELECT only).

## The FK reality (the Data BLOCK that rev-1 missed)

`items.id` has **three** referrers (`schema.ts`), none with `ON DELETE CASCADE`:
- `photos.item_id` (**nullable**) → cascade-delete (hard) + blob cleanup.
- `preferences.item_id` (**`.notNull()`** — `schema.ts:232`) → cascade-delete (hard); derived per-curator triage state, re-derivable, safe to remove.
- `sort_result_items.item_id` (**`.notNull()`** — `schema.ts:291`) → **BLOCK** (owner decision): purge **refuses with 409** if any `sort_result_item` references the item. This preserves every sort result (draft and finalized) — purge never silently mutates a result, consistent with the finalized-immutability shipped in `purses-526`/`gmn`. The owner must remove the item from its results first.

So a hard `DELETE FROM items` only runs for an item with **no** sort-result-item rows; the FK on `sort_result_items.item_id` is the integrity backstop for any concurrency race (a concurrently-created result-item makes the item DELETE `23503` → rollback → 500; rare, safe).

## Approach

### Route — authz BEFORE any body parsing (Security F2), owner-only, confirm

`POST /api/items/[id]/purge` (read `params.id`):
1. `userId = await requireAuth()` → **401** if unauthenticated.
2. Resolve the item **including soft-deleted** via `ItemRepository.findByIdIncludingDeleted(params.id)` (purge follows archive/soft-delete; `findById` filters `deletedAt` so it cannot be reused) → **404** if truly absent.
3. **Owner-only authz** via a new DAL helper `requireApiCollectionOwner(db, item.collectionId, userId): Collection | NextResponse` — the collection id comes **only** from the server-resolved `item.collectionId` (never from the request body/path); returns the collection iff `collection.ownerId === userId`, else **404** (absent collection) / **403** (member-but-not-owner or non-member). Mirrors `requireApiCollectionAccess`'s 404/403 convention. **No request-body parsing happens before this gate passes** — a non-owner sending malformed JSON gets 403, not a 400 oracle.
4. **Only now** parse + validate `{confirm:"PURGE"}` → **400** on missing/wrong/invalid JSON.
5. `await itemPurgeService.purge(item.id)`; map a thrown `ItemInResultError` → **409** (`"Item is part of a sort result; remove it from results first"`).
6. **200** `{ message: "Item purged" }`.

### `ItemPurgeService.purge(itemId)` — the orchestration (Architect: a service, not the controller)

The op coordinates four repos + a transaction + an external Blob side-effect with its own failure policy — too heavy for `ItemController`. New `src/server/services/ItemPurgeService.ts`:

```
async purge(itemId) {
  if (await this.sortResultItemRepo.existsByItem(itemId)) throw new ItemInResultError(); // → 409, no tx opened
  const blobKeys = await withTransaction(this.db, async (tx) => {
    const prefRepo  = new CollectionPreferenceItemRepository(tx);
    const photoRepo = new PhotoRepository(tx);
    const itemRepo  = new ItemRepository(tx);
    await prefRepo.deleteByItem(itemId);                 // hard-delete preferences (children-first)
    const keys = await photoRepo.hardDeleteByItem(itemId); // hard-delete photos, RETURNING blob_key
    await itemRepo.hardDelete(itemId);                   // hard-delete the item
    return keys;
  });
  // after commit — best-effort, non-fatal:
  await Promise.allSettled(
    blobKeys.filter((k) => k.startsWith("http")).map((k) => del(k)),
  ); // log any rejections
}
```

- **Invariant:** inside the transaction, writes use ONLY tx-bound repos (`new …(tx)`), never injected ones.
- **DB-atomic, blobs best-effort post-commit:** the row deletes commit-or-rollback together; `del()` runs after commit (an external side-effect that can't join the tx), best-effort with the `startsWith("http")` guard the existing single-photo delete route uses (`collections/[id]/items/[itemId]/photos/[photoId]/route.ts:48`) — non-URL keys are skipped; a `del` failure is logged, not fatal (orphaned blobs are inert/sweepable). DB-first ordering means no blob is deleted while its row survives.
- **`hardDeleteByItem` returns ALL photo rows' blob keys (active + soft-deleted)** via `DELETE FROM photos WHERE item_id = $1 RETURNING blob_key` — `findByItem` filters `deletedAt`, so reusing it would orphan soft-deleted photos' blobs; the purge path must NOT filter `deletedAt`.

### New methods

- DAL: `requireApiCollectionOwner(db, collectionId, userId): Promise<Collection | NextResponse>`.
- `IItemRepository`: `findByIdIncludingDeleted(id): Promise<Item | null>` (no `deletedAt` filter); `hardDelete(id): Promise<void>` (real `DELETE FROM items`).
- `IPhotoRepository`: `hardDeleteByItem(itemId): Promise<string[]>` (real `DELETE … RETURNING blob_key`, all rows).
- `ICollectionPreferenceItemRepository`: `deleteByItem(itemId): Promise<void>` (real `DELETE FROM preferences WHERE item_id = $1`).
- `ISortResultItemRepository`: `existsByItem(itemId): Promise<boolean>` (the 409 block check; `SELECT 1 … WHERE item_id = $1 LIMIT 1`). Note: `sort_result_items` has no `item_id` index (only `result_id`), so this is a seq scan — N is tiny per item, acceptable; no schema change in scope.

## Error handling

- 401 unauth; 404 absent item/collection; **403 non-owner** (incl. member-not-owner); 400 missing/wrong confirm or invalid JSON (**only after** authz passes); **409** item-in-a-sort-result (`ItemInResultError`, no rows touched); 500 on an unexpected DB failure (the cascade rolls back atomically). Blob deletion best-effort post-commit (logged, non-fatal).

## Security (vibe-security — permanent destructive op)

- **Owner-only**, server-resolved from `collections.ownerId`; a member (non-owner) → 403. `{confirm:"PURGE"}` gates accidental fire. Authz strictly **before** any body parsing (no 400 oracle to non-owners).
- **IDOR/cross-tenant:** `params.id` (item) → server-resolved `item.collectionId` → owner check; no id trusted from the body; the collection id has a single source (`item.collectionId`). A non-owner of the item's collection → 403/404.
- Permanent + irreversible: owner + explicit confirm (matches §11.4 "owner-only + explicit confirmation").

## Testing

- **Un-mocked DB integration (`RUN_DB_TESTS`, authoritative) in `src/lib/db/`** (mock ONLY `@vercel/blob`'s `del`):
  - **Owner purge (no results):** seed collection + item + ≥2 photos (real `blobKey`s incl. one soft-deleted photo) + ≥1 preference. Drive the real route as **owner** → 200; assert the item row is GONE (`findById`/`findByIdIncludingDeleted` null — hard), all photo rows gone (active + soft-deleted), all preference rows gone, and `del` called with all (http) blob keys.
  - **Block (409):** seed an item that has a `sort_result_item` (generate a result) → owner purge → **409**, and the item + photos + preferences + the result-item all **survive** (nothing deleted).
  - **Authz/contract:** non-owner member → **403** (item survives); non-member → 403/404; absent item → 404; **non-owner with malformed body → 403** (not 400 — proves authz precedes confirm parsing); missing/wrong confirm (as owner) → 400 (nothing deleted); unauth → 401.
- **Unit:** `requireApiCollectionOwner` (owner→collection / member→403 / absent→404); the repo hard-delete + `existsByItem` signatures; `ItemPurgeService.purge` orchestration (existsByItem short-circuits to `ItemInResultError`; tx used; `del` called post-commit with the http filter) — mock repos + Blob, but the authoritative removal proof is the un-mocked integration test.

## Decisions resolved
- **Block (409) on any sort-result membership** (owner choice) — preserve all results; cascade preferences + photos + item otherwise.
- Orchestration in a dedicated `ItemPurgeService` (Architect).
- `findByIdIncludingDeleted` is a firm requirement (Security/Data F1/F4).
- Authz before body parsing (Security F2). Blob `del` keeps the `startsWith("http")` guard (Security/Data F5).

## Advances

Closes `purses-u3p` (item-purge half; `purgeCollection` remains its own bead). Reuses `withTransaction` (purses-nea).
