# Design: All cards render images correctly (purses-nkp)

**Issue:** purses-nkp · **Date:** 2026-06-16 · **Branch:** `fix/purses-nkp-card-images`

## Problem

Item cards on the sorting and results surfaces show only the item's initial
letter, never its photo. Reported on the triage screen
(`/collections/<id>/sort/<sessionId>/triage`).

## Root cause

Image `src` URLs are built by `getPhotoAssetUrlForPhoto(photo, collection.id)`
([src/lib/photos.ts:12](../../../src/lib/photos.ts)). The argument must be the
collection's **ULID `collection.id`**, because the photo `/file` API authorizes
with `item.collectionId !== params.id`
([file/route.ts:28](../../../src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts)).
The URL helper is fine. The broken surfaces simply **never load the hero photos**,
so `heroPhotoUrl` / `heroA` / `heroB` are `undefined` and the card falls back to
the initial. This is a missing-data-load bug, not a URL bug.

Working surfaces (collections list, items list, item detail) already load photos
and pass `collection.id`. The fix makes the broken surfaces match them.

## Scope

**In scope** — three authenticated surfaces:

| Surface | File | Today | Fix |
|---|---|---|---|
| Triage | `sort/[sessionId]/triage/page.tsx` | `ItemCard` with no `heroPhotoUrl` | Load current item's cover; pass `heroPhotoUrl` |
| Compare | `sort/[sessionId]/compare/page.tsx` | `CompareChoice` with no `heroA/heroB` | Load covers for `itemA`/`itemB`; pass `heroA`/`heroB` |
| Results | `results/[resultId]/page.tsx` | `MostLovedHero` + ranked `ItemCard`s, no photos | Batch-load covers for ranked items; pass `heroPhotoUrl` |

**Out of scope** (own beads):
- Public shared-results card images → **purses-bwr** (needs a new token-authorized
  public image endpoint; this issue blocks it).
- Route slugs/numbers → **purses-9hl** (this issue blocks it; it rebases on the
  corrected triage page).

## Design

**Reuse the existing batch loader.** `PhotoRepository.findCoverPhotosByItemIds(itemIds)`
([PhotoRepository.ts:75](../../../src/server/repositories/implementations/PhotoRepository.ts))
returns `Map<itemId, Photo>` (hero wins, else earliest photo) and is exactly how the
working items-list grid avoids N+1. No new repository method.

Per surface, after the items are loaded:

- **Triage** — only the current `item` is shown. Load its cover
  (`findCoverPhotosByItemIds([item.id])`, or `findByItem` since it's a single item)
  and pass `heroPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id) : undefined}`.
- **Compare** — two items. Batch `findCoverPhotosByItemIds([itemA.id, itemB.id])`;
  pass `heroA` / `heroB` built with `collection.id`.
- **Results** — many items. Batch `findCoverPhotosByItemIds(rankedItemIds)`; pass
  `heroPhotoUrl` to `MostLovedHero` (hero item) and each ranked `ItemCard`.

**Invariant:** the image URL's collection segment is always `collection.id` (ULID),
never `collection.slug`. A slug there 404s the `/file` route. (The `collectionId`
prop these components also use for the item *nav link* legitimately stays
`slug ?? id` — nav vs data, per #190. Only the image arg is constrained.)

`next/image` stays `unoptimized` on these protected `/file` URLs so the browser
sends the user's auth cookies (memory: `authenticated-image-api-urls`). `ItemCard`
already sets this; `MostLovedHero` / `CompareChoice` to be verified.

**Verify (not assumed):** confirm `PhotoGallery`'s `collectionId` prop on the photos
page is `collection.id` (it issues API calls); fix if it was switched to slug.

## Testing (TDD; must run in CI)

- **Component (triage):** failing test first — render the triage page's card with an
  item that has a hero photo; assert an `<img>` with the `/file` src renders (not the
  initial). Drives the fix.
- **Guard:** assert the image `src` contains `collection.id` (ULID), not the slug, on
  at least one surface — locks in the invariant that caused the confusion.
- **Compare / results:** assert hero `<img>` renders for items with covers; initial
  fallback only when no cover.
- Reuse existing test patterns (`ItemCard.test.tsx`, `MostLovedHero.test.tsx`,
  `CompareChoice.test.tsx`); no new harness.

## Review gates (before merge)

`ui-ux-pro-max` (rendered UI), then `adversarial-review`. UI PR ships with light+dark
screenshots of triage/compare/results (memory: `ui-prs-include-screenshots`).
