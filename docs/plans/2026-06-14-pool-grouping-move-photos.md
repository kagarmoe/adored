# Unified "Move to…" — regroup photos (purses-42y, the rest)

**Date:** 2026-06-14 · **Issue:** purses-42y (move / split / return-to-pool; merge deferred → purses-1xr).
Owner decisions: ONE unified "Move to…" interaction (covers move + split + return-to-pool); merge deferred.
Governed by `TONE.md` (first-order), `DESIGN.md`. Tap-first, no swiping.

## The insight
Move, split, and return-to-pool are one operation: **reassign selected photos' `item_id`**.
- **Move** → an existing item · **Split** → a new item · **Return to pool** → `item_id = NULL`.

## Hero reconciliation (the careful part)
When photos are reassigned, hero state must stay coherent:
- **Destination = existing item:** moved photos become non-hero there (the target keeps its own hero).
- **Destination = new item:** the first moved photo becomes that new item's hero.
- **Destination = pool:** `is_hero = false`.
- **Every source item that loses photos:** if it no longer has a hero among its remaining photos (its hero moved away) and still has photos, promote its first remaining photo to hero. If a source item is left empty, leave it (no auto-delete — predictable; the person can delete it).

## Build — two PRs

### PR 1 — backend primitive (this plan, DB-tested)
- `PhotoRepository.findByIds(collectionId, photoIds)` — fetch non-deleted photos in the collection (validation + source/hero inspection).
- `PhotoRepository.reassignPhotos(collectionId, photoIds, targetItemId, heroPhotoId)` — single guarded `UPDATE` set `item_id = $target` (nullable), `is_hero = (id = $hero)` or `false` when `heroPhotoId` is null; `WHERE collection_id = $c AND id IN ids AND deleted_at IS NULL`; returns affected count.
- `ItemService.reassignPhotos(collectionId, photoIds, dest)` where `dest = {type:"item",itemId} | {type:"new"} | {type:"pool"}`:
  1. dedupe; non-empty; `<= MAX_GROUP_PHOTOS`.
  2. `findByIds` → if count ≠ ids.length, `conflict` (some don't belong / deleted).
  3. resolve target + hero: item → validate target item in collection (else conflict), hero=null; new → create item, hero=ids[0]; pool → target=null, hero=null.
  4. record source item ids (`photos`' current `itemId`, non-null, ≠ target).
  5. `reassignPhotos(...)`.
  6. for each source item: if it has photos but no hero, `setHero(firstRemaining)`.
  7. return `{ number }` for item/new destinations, `{}` for pool.
- `POST /api/collections/[id]/photos/reassign` — member-or-owner auth; body `{ photoIds, destination }`; validates shape; maps `PoolGroupError`→409/400.
- **Tests:** DB (hero reconciliation: moving a source's hero promotes a remaining photo; move to existing keeps target hero; split→new sets first as hero; return-to-pool clears hero; cross-collection/deleted id rejected). Service unit (orchestration, conflict, new-item create). Route (auth, validation, mapping).

### PR 2 — UI
- `PhotoGallery`: tap-to-select photos (aria-pressed) + a sticky action bar ("N selected · Move to… · Clear"); keep per-photo set-hero/delete.
- A **destination sheet** on "Move to…": the collection's other items (passed from the server page) + "New item" + "Back to the pool"; tap → POST reassign → optimistic removal of moved photos from the gallery + gentle person-side confirmation.
- Item detail page passes the collection's other items to `PhotoGallery`.
- Component tests + light/dark screenshots.

## TONE
Person-side copy ("Moved to …", "Now its own item", "Back in the pool"); no counts-as-shame; tap-first; ≥44px; both themes; AA.
