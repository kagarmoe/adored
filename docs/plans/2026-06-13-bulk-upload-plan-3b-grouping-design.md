# Plan 3b — Pool → "Make an item" grouping (design)

**Date:** 2026-06-13
**Issue:** purses-b1k (bulk image upload — upload-first, defer metadata), phase 3b.
**Builds on:** Plan 2 (durable photo pool, #134) and Plan 3a (catalog-number URLs +
nameless items, #143). Governed by [`TONE.md`](../../TONE.md), [`PRODUCT.md`](../../PRODUCT.md),
and [`DESIGN.md`](../../DESIGN.md). Parent design:
[`2026-06-10-bulk-upload-pool-design.md`](./2026-06-10-bulk-upload-pool-design.md) (§ "Grouping into items").

## Goal

Turn the passive pool view into a place where a person **selects pooled photos and makes them
into an item** — at their own pace, one item at a time. The urgent "get photos in fast" need is
already met by Plan 2's bulk upload; grouping is the unhurried, affirming act of giving an object
its place. No metadata is required to make an item (Plan 3a made `name` and the descriptive fields
optional); a photo-only item is identified by its photo and its catalog number.

## Decisions (resolved in brainstorming, 2026-06-13)

1. **Selection model — tap = select, no mode switch.** Each pooled photo tile toggles a selected
   state on tap (checkmark + ring overlay; the whole tile is the ≥44px target). Pooled photos have
   no detail page, so a tap has nothing to compete with — this is the purest tap-first affordance.
   No swiping.
2. **Grouping — combine only.** "Make an item" combines **all** selected photos into **one** item.
   To make many single-photo items, you select one and make it, repeatedly. This fits TONE's
   "one thing at a time, unpressured": the fast part (upload) is done; making items is meant to be
   slow and loving. When an object has several shots (front / back / detail), you select them
   together.
3. **After the action — stay in pool, gentle confirmation.** Grouped photos leave the pool, the
   selection clears, and a quiet confirmation appears (`Made #7 — find it in your items`). No
   navigation away; momentum is preserved for processing more photos. No "N incomplete"
   count-shaming (TONE commitment 4).
4. **Hero — first selected.** The first-selected photo becomes the item's hero, changeable later in
   the item's edit form. Hero only visibly matters when 2+ photos are combined.
5. **Regrouping deferred.** Move a photo between items, split an item, merge two items, and a
   possible "make each its own item" bulk action are **out of 3b** — filed as a P2 follow-up bead.

## UI

The pool page (`src/app/collections/[id]/pool/page.tsx`) already renders `PoolUpload` +
`PoolPhotoGrid`. 3b makes the grid interactive:

- **`PoolPhotoGrid`** gains selection: a tap toggles the photo's id in a selected set; selected
  tiles show a checkmark + ring using luminous-system tokens (both themes, AA). Selection order is
  preserved so the first-selected can be marked hero.
- **Sticky action bar** (new, appears only when ≥1 selected): `{n} selected` · **Make an item** ·
  **Clear**. Fixed to the bottom, ≥44px targets, safe-area aware. "Make an item" is disabled while
  the request is in flight.
- On success: the grouped ids are removed from the local grid (optimistic), selection clears, and
  a quiet, auto-dismissing confirmation shows the new item's number. On failure: the photos stay
  selected and an unobtrusive error message invites a retry (no data lost — the photos are still
  pooled).

Empty/loading states from Plan 2 are unchanged.

## Backend — one guarded operation

**Endpoint:** `POST /api/collections/[id]/pool/group`. Auth mirrors the existing pool routes
exactly: `getSession` → load collection + membership → **member-OR-owner** (`membership` exists or
`collection.ownerId === session.user.id`), else 401/403/404. Request body: `{ photoIds: string[] }`
(non-empty; a sane upper bound, e.g. ≤ 50, rejected as 400 otherwise).

**Service:** new `ItemService.createItemFromPool(collectionId, photoIds)`:

1. Create the item first — `ItemRepository.create({ collectionId })` auto-allocates the
   per-collection catalog number (Plan 3a; retries the `UNIQUE(collection_id, number)` race).
2. **Guard-assign the photos and set the hero in one statement** — new
   `PhotoRepository.assignPooledPhotosToItem(collectionId, photoIds, itemId, heroPhotoId)`. A single
   `UPDATE` sets `item_id = $itemId, is_hero = (id = $heroPhotoId)` with a `WHERE` that matches only
   `collection_id = $collectionId AND id IN (...) AND item_id IS NULL AND deleted_at IS NULL`. It
   returns the affected-row count; if `count !== photoIds.length`, the service **throws** (the route
   maps it to 409/400). `heroPhotoId` is `photoIds[0]` (selection order is preserved client-side).
3. Return the created `Item` (the route responds with `{ number }`).

Folding the hero flag into the assignment `UPDATE` (rather than a separate `setHero` write) is
deliberate: it makes "photos assigned" and "hero chosen" **one atomic row update**, so there is no
window where an item has photos but no hero. The existing `setHero` (clear-then-set, two writes) is
for re-choosing a hero on an item that already has one — not needed here, where every photo is fresh.

### Why this order, and partial-failure behavior

neon-http is **stateless — there is no multi-statement transaction**, so create and assign are two
sequential writes. Ordering **create → assign** makes the only partial failure *recoverable, not
corrupt*: create succeeds, assign fails → a nameless empty item exists (harmless; openable,
deletable) and all photos remain pooled. The person simply tries again.

The guarded affected-count check is what makes assignment safe without a transaction: it is
all-or-the-operation-rejects at the row-matching level (the `WHERE` filters every disqualified row),
so we never assign a partial/incorrect subset silently. And because hero is set in the same `UPDATE`,
a successful assignment always yields a complete, hero-bearing item.

## Files

**New**

- `src/app/api/collections/[id]/pool/group/route.ts` — the POST endpoint (+ `route.test.ts`).
- `src/features/pool/PoolActionBar.tsx` — sticky selection action bar (+ component test).

**Changed**

- `src/features/pool/PoolPhotoGrid.tsx` — selection state, selected overlay, lifts selected set to
  a parent client component (or holds it and renders the action bar). Keeps a single client
  boundary for the pool's interactive surface.
- `src/server/services/ItemService.ts` — add `createItemFromPool`.
- `src/server/repositories/implementations/PhotoRepository.ts` — add
  `assignPooledPhotosToItem` (+ interface in `PhotoRepository.ts`).
- `src/app/collections/[id]/pool/page.tsx` — pass `collectionId` to the now-interactive grid; the
  grid owns selection + the action bar.

## Testing (TDD, red → green)

- **Repo** (`RUN_DB_TESTS=1`): `assignPooledPhotosToItem` — assigns the matching pooled rows,
  returns the right count, and sets `is_hero` true on exactly the `heroPhotoId` (false on the rest);
  a cross-collection id is not assigned (count short → caller rejects); an already-assigned id is
  not re-assigned; a deleted id is excluded.
- **Service**: `createItemFromPool` creates the item then assigns; the returned item carries its
  catalog number; the first photo is the hero; a count mismatch throws (leaving the photos pooled);
  empty / oversized `photoIds` rejected.
- **API route**: 401 unauthenticated, 403 non-member, 404 unknown collection; happy path returns
  `{ number }` and the photos leave the pool; malformed / cross-collection `photoIds` → 4xx.
- **Client**: `PoolPhotoGrid` toggles selection; action bar appears at ≥1 and clears on Clear;
  on success the grouped tiles disappear and the confirmation shows the number; on failure the
  selection is retained.

## Gates

`npm run build` · `npm run test:ci` · `npm run lint` · `npm run auth:verify` · DB tests
(`RUN_DB_TESTS=1`, run serially — see `db-test-parallel-deadlock` memory). UI change → **light +
dark screenshots** in the PR (pool with a selection + the action bar). Code review before merge.

## Out of scope (3b)

- Move / split / merge / reassign photos between items → P2 follow-up bead.
- "Make each its own item" bulk action → same follow-up.
- Deferred-metadata surfacing ("items that could use details") → **Plan 4**.
- Bulk metadata editing; orphan-blob sweep → future.
