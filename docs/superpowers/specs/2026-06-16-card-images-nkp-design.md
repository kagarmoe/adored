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

Plus shared test infrastructure: ~10 real CC0/PD image fixtures + extended e2e seeding
(item + photo) + a real-browser triage image test (see Testing). These are reusable by
purses-bwr.

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

**Bar (project policy):** baseline coverage is ~20%. Every **route** and **UI element**
this change touches gets real tests that run automatically in `npm run test:ci`
(`vitest run`). No surface is touched without a test. TDD: failing test first.

**Routes touched** — the three pages are async Server Components and have **no tests
today**. Add a render test for each, reusing the existing `vi.hoisted` + `vi.mock`
pattern from the API-route tests (mock `@/lib/auth` `getSession`, `@/lib/db` `getDb`,
and the repos the page constructs). Each test `await`s the page function and renders
the returned element with RTL:

| Route | Assertions |
| --- | --- |
| `sort/[sessionId]/triage/page.tsx` | item with a cover → hero `<img>` whose `src` contains `collection.id` (ULID), not the slug; item without a cover → initial fallback, no `<img>`; `findCoverPhotosByItemIds` called with the current item's id |
| `sort/[sessionId]/compare/page.tsx` | `itemA`/`itemB` with covers → two hero images (`heroA`/`heroB`) using `collection.id`; missing cover → that side falls back to initial |
| `results/[resultId]/page.tsx` | ranked items with covers → `MostLovedHero` + grid `ItemCard`s render hero images; covers batch-loaded once (no per-item query) |

**UI elements touched** — assert image-vs-initial behavior directly:

- `ItemCard` (has tests) — extend: renders `<img>` when `heroPhotoUrl` set, initial when not.
- `MostLovedHero`, `CompareChoice` (have tests) — extend with the same image/initial cases.

**Guard test:** on at least one surface, assert the image `src` segment is
`collection.id` (ULID), **not** `collection.slug` — locks in the invariant that caused
the original confusion and would catch a future slug regression.

**Real-browser e2e (in scope, folded in):** a Playwright test that visits triage as the
seeded authenticated user and asserts the hero image renders.

- **Blob reality check:** there is no local blob emulator. The `/file` route calls
  `get(photo.blobKey)` against real Vercel Blob, and e2e runs a real `next start`. So the
  test **intercepts** the `**/photos/*/file` request in the browser
  (`page.route(...)`) and fulfills it with a committed fixture image. This keeps the test
  hermetic (no blob token, no network) while still exercising the real page, real server
  routing, and real seeded DB — and asserts the requested URL carries `collection.id`.
- **Seeding:** extend `e2e/fixtures/seed.ts` to create an item + a hero photo row for the
  seeded collection. `blobKey` can be a fixed placeholder (the browser intercepts before
  the server's blob fetch runs).

### Test image fixtures (real CC0/public-domain)

Add ~10 openly-licensed real photos under `e2e/fixtures/photos/` for e2e and any
visual/screenshot use, replacing the lone existing `IMG_0428.jpeg` as the canonical set.

- **Provenance:** sourced from Wikimedia Commons items marked Public Domain or CC0.
  Each file's source URL + license recorded in `e2e/fixtures/photos/LICENSES.md`. License
  verified before committing — anything not unambiguously PD/CC0 is dropped.
- **Subject:** handbags/purses where available (fits the product), generic objects
  otherwise. Realism matters only for screenshots; tests assert presence, not content.
- Reusable by **purses-bwr** (public shared-results images) — that's why they live in a
  shared fixtures dir, not inline in one test.

No new test harness — the `vi.mock` pattern, RTL, and Playwright the repo already uses.

## Review gates (before merge)

`ui-ux-pro-max` (rendered UI), then `adversarial-review`. UI PR ships with light+dark
screenshots of triage/compare/results (memory: `ui-prs-include-screenshots`).
