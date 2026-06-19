# Item purge — permanent hard-delete + blob cleanup (purses-u3p) — design

**Date:** 2026-06-19. **Bead:** purses-u3p (P2 bug). **Branch:** `fix/u3p-item-purge`.

## Why

`POST /api/items/[id]/purge` (`src/app/api/items/[id]/purge/route.ts`) `requireAuth()`s, validates `{confirm:"PURGE"}`, then calls `ItemController.purgeItem()` — an **empty stub that ignores `params.id` and deletes nothing** — yet returns `200 "Item purged successfully."` A success message that does nothing is a data-integrity/UX trap (surfaced by the PR #204 API audit). Per the user decision, build the real purge ("the right way"), not an honest-501 stub.

Purge = the **permanent** tier (infra §11.4 / ARCHITECTURE decision-13): hard-delete the item **and its dependent photo rows and blobs**, owner-only, with explicit confirmation. Today `Item`/`Photo` deletes are **soft only** (`ItemRepository.softDelete`, `PhotoRepository.delete` → `softDelete`); there is no hard delete. The `photos.item_id → items.id` FK has **no `ON DELETE CASCADE`**, so children must go first.

## Goal & scope

- **Goal:** `POST /api/items/[id]/purge` permanently removes the item, its photo rows (active **and** already-soft-deleted), and the photos' blobs — owner-only, confirmed, atomic at the DB tier.
- **In scope:** the item purge route + `ItemController.purgeItem(itemId)` + the new hard-delete repo methods + an owner-only authz helper.
- **Out of scope:** `purgeCollection` (a separate stub, `src/server/api/collections.ts` — its own bead). No UI — purge has **no caller today**, so this makes the API real but UI-unreachable (a separate feature); the bead's goal (stop the lying 200) is met by it actually purging. No schema change (DELETE-only).

## Approach

### Route — owner-only + confirm + resolve the item

`POST /api/items/[id]/purge` (read `params.id` — the route currently ignores it):
1. `requireAuth()` → `userId` (401 if unauthenticated).
2. Resolve the item by `params.id` **including soft-deleted** (purge typically follows archive/soft-delete) → **404** if truly absent.
3. **Owner-only authz** via a new DAL helper `requireApiCollectionOwner(db, item.collectionId, userId): Collection | NextResponse` — returns the collection if `collection.ownerId === userId`, else **404** (absent collection) / **403** (member-but-not-owner, or non-member). This is stricter than `requireApiCollectionAccess` (member-or-owner); purge is owner-only per §11.4. (Reusable for the future `purgeCollection`.)
4. Validate `{confirm:"PURGE"}` → **400** on missing/wrong/invalid JSON.
5. `await itemController.purgeItem(item.id)`.
6. **200** `{ message: "Item purged" }` (now truthful) — or 204; keep the existing shape.

### `ItemController.purgeItem(itemId)` — DB-atomic cascade, then best-effort blobs

1. **Collect blob keys** of *all* the item's photos (active + soft-deleted) — a `Photo[]` read that ignores `deletedAt` (purge must clean up blobs of already-soft-deleted photos too).
2. **`withTransaction`** (the pattern established by purses-nea): hard-delete the item's photo rows **then** the item row (children-first; FK has no cascade) — both real `DELETE FROM` (not soft). Atomic: a failure rolls back, leaving the item + photos intact.
3. **After the transaction commits**, delete the blobs best-effort: `del(blobKeys)` (`@vercel/blob`, as `photos/[photoId]/route.ts:50` already does). Blob deletion is an **external** side-effect that cannot join the DB transaction, so it runs after commit; a failure is **logged, not fatal** (orphaned blobs are harmless storage, sweepable later). DB-first ordering means we never delete a blob whose row still exists.

### New methods

- DAL: `requireApiCollectionOwner(db, collectionId, userId): Promise<Collection | NextResponse>` (owner-only; mirrors `requireApiCollectionAccess`'s 404/403 shape).
- `IPhotoRepository`: `hardDeleteByItem(itemId: string): Promise<string[]>` — real `DELETE FROM photos WHERE item_id = $1 RETURNING blob_key` (all rows incl. soft-deleted), returns the deleted blob keys. (Reading-then-deleting is also fine; `RETURNING` folds the two into one statement and avoids a read/delete race inside the tx — preferred.)
- `IItemRepository`: `hardDelete(itemId: string): Promise<void>` — real `DELETE FROM items WHERE id = $1`.
- A method to fetch the item **including soft-deleted** for the route's 404 resolution (if `findById` already returns soft-deleted rows, reuse it; else add `findByIdIncludingDeleted`). Confirm against `ItemRepository.findById` during the plan.

`purgeItem` opens the transaction, calls `tx`-bound `hardDeleteByItem` (collecting blobKeys via RETURNING) + `hardDelete`, returns the blobKeys; the service deletes the blobs after commit. **Invariant:** inside the tx, only tx-bound repos write.

## Error handling

- 401 unauthenticated; 404 absent item / collection; **403 non-owner** (member-but-not-owner included); 400 missing/wrong confirm or invalid JSON.
- DB cascade is atomic (transaction); a mid-cascade failure rolls back (item + photos intact). Blob deletion best-effort post-commit (logged, non-fatal). No partial DB state.
- The route's existing try/catch maps `Unauthorized`→401; add explicit mapping for the authz `NextResponse` (404/403) and keep 400 for confirm/JSON.

## Security (vibe-security — primary concern; this is a permanent destructive op)

- **Owner-only**, server-resolved (`collection.ownerId === userId` from the DB, never a client value). A member (non-owner) gets 403. Confirm gate prevents accidental fire.
- **IDOR:** `params.id` is resolved server-side to the item → its collection → owner check; no cross-tenant purge (a non-owner of the item's collection is 403/404). No id from the body is trusted.
- Permanent + irreversible: gated behind owner + explicit `{confirm:"PURGE"}` (matches §11.4 "owner-only + explicit confirmation").

## Testing

- **Un-mocked DB integration (`RUN_DB_TESTS`, the authoritative proof) in `src/lib/db/`:** seed a collection + an item + ≥2 photos (real rows with `blobKey`s; include one soft-deleted photo). Mock ONLY the external Blob boundary (`vi.mock("@vercel/blob", del)`). Drive the real purge route as the **owner**; assert the item row is GONE (`ItemRepository.findById` null — hard, not soft), all photo rows for the item are GONE (active + soft-deleted), and `del` was called with **all** the blob keys. Then a second assertion that the DB cascade is **atomic** (if a hard-delete fails mid-tx, nothing is removed — can be a focused unit/integration check).
- **Authz/contract (un-mocked DB, real route):** a **non-owner member** → **403** (item + photos survive); a **non-member** → 403/404; **absent item** → 404; **missing/wrong confirm** → 400 (nothing deleted); unauthenticated → 401.
- **Unit:** `requireApiCollectionOwner` (owner→collection, member→403, absent→404); the repo hard-delete methods (signatures); `purgeItem` orchestration (blobKeys collected, tx used, `del` called post-commit) — mock the repos + Blob, but the **authoritative** removal proof is the un-mocked integration test above.

## Risks / decisions for the reviewers

1. **Data:** is the `withTransaction` + children-first hard-delete correct, and is `hardDeleteByItem ... RETURNING blob_key` the right way to atomically remove rows + collect keys? Any concern deleting soft-deleted photo rows (they may have `deletedAt` set but the blob still exists)?
2. **Security:** is `requireApiCollectionOwner` the right boundary, and is resolving the item (incl. soft-deleted) before the owner check safe (no existence oracle beyond what 404/403 already leak to a would-be owner)?
3. **Architect:** `purgeItem` on `ItemController` vs a dedicated `ItemPurgeService` (it touches two repos + Blob + a transaction — heavier than the controller's other one-repo methods). Where should the orchestration live?
4. Blob-delete failure handling: log-and-continue (orphans) vs surface — confirm log-and-continue is acceptable.

## Advances

Closes `purses-u3p` (the item-purge half; `purgeCollection` remains its own bead). Reuses the `withTransaction` pattern from `purses-nea`.
