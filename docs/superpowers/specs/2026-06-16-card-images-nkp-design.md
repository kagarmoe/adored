# Design: All cards render images correctly (purses-nkp)

**Issue:** purses-nkp · **Date:** 2026-06-16 · **Branch:** `fix/purses-nkp-card-images`

> Hardened 2026-06-16 after an adversarial spec review (QA, Architect/Data, Craftsman,
> UX/Design). Findings folded in throughout; summary under **Review outcome** at the end.

## Problem

Item cards on the sorting and results surfaces show only the item's initial letter, never
its photo. Reported on the triage screen
(`/collections/<id>/sort/<sessionId>/triage`).

## Root cause

Image `src` URLs are built by `getPhotoAssetUrlForPhoto(photo, collection.id)`
([src/lib/photos.ts:12](../../../src/lib/photos.ts)). The argument must be the
collection's **ULID `collection.id`**, because the photo `/file` API authorizes with
`item.collectionId !== params.id`
([file/route.ts:28](../../../src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts)).
The URL helper is fine. The broken surfaces simply **never load the hero photos**, so
`heroPhotoUrl` / `heroA` / `heroB` are `undefined` and the card falls back to the initial.
This is a missing-data-load bug, not a URL bug.

Working surfaces (collections list, items list, item detail) already load photos and pass
`collection.id`. The fix makes the broken surfaces match them.

## Scope

**In scope** — three authenticated surfaces (paths under `src/app/collections/[id]/`):

| Surface | File | Today | Fix |
| --- | --- | --- | --- |
| Triage | `sort/[sessionId]/triage/page.tsx` | `ItemCard`, no `heroPhotoUrl` | load current item's cover; pass `heroPhotoUrl` |
| Compare | `sort/[sessionId]/compare/page.tsx` | `CompareChoice`, no `heroA/heroB` | load covers for `itemA`/`itemB`; pass `heroA`/`heroB` |
| Results | `results/[resultId]/page.tsx` | `MostLovedHero` + ranked `ItemCard`s, no photos | batch-load covers; pass `heroPhotoUrl` |

Plus: a broken-image fallback in the three components (see **Failure & empty states**) and
shared test infra (~10 CC0 fixtures + e2e seeding + a browser test). The fixtures are
reusable by purses-bwr.

**Out of scope** (own beads):

- Public shared-results card images → **purses-bwr** (needs a token-authorized public image
  endpoint; this issue blocks it).
- Route slugs/numbers → **purses-9hl** (this issue blocks it; it rebases on the corrected
  triage page).

## Design

**Reuse the existing batch loader.** `PhotoRepository.findCoverPhotosByItemIds(itemIds)`
([PhotoRepository.ts:75](../../../src/server/repositories/implementations/PhotoRepository.ts))
returns `Map<itemId, Photo>` (hero wins, else earliest; entries always have a non-null
`itemId`) — the same loader the working items-list grid uses. No new repository method.

Per surface, after items are loaded, mirror the proven `items/page.tsx:31,92` pattern:

- **Triage** — single current `item`: pass
  `heroPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id) : undefined}`.
- **Compare** — two items: batch `findCoverPhotosByItemIds([itemA.id, itemB.id])`; pass
  `heroA`/`heroB` built with `collection.id`.
- **Results** — many items: batch over ranked item ids (one query); pass `heroPhotoUrl` to
  `MostLovedHero` and each grid `ItemCard`.

Inline per page — **no shared helper** (the load is two lines and the three shapes differ;
"three lines before a helper").

**Invariant (load-bearing) and its named hazard.** The image URL's collection segment is
always `collection.id` (ULID), never `collection.slug` — a slug 404s the `/file` route. The
trap is concrete on the **results** page: `MostLovedHero`/`ItemCard` there are passed
`collectionId={collection.slug ?? collection.id}` (results page lines 111/120) for their nav
link, and that slug-or-id prop is the closest collection value in scope at the call site. The
new image argument must explicitly use `collection.id` (available at results page line 50),
**not** the nav prop. (The nav `Link` legitimately keeps `slug ?? id` — nav vs data, per #190.)

**Components already support this — no component prop work.** `ItemCard` (`heroPhotoUrl`),
`MostLovedHero` (`heroPhotoUrl`), and `CompareChoice` (`heroA`/`heroB`) already accept the
props and already set `next/image` `unoptimized` (verified ItemCard.tsx:43,
MostLovedHero.tsx:28, CompareChoice.tsx:73) so the browser sends the user's auth cookies
(memory: `authenticated-image-api-urls`). This issue is purely page-side data loading plus
the failure fallback below.

## Failure & empty states

- **No cover row** → `heroPhotoUrl` undefined → existing initial-letter affordance (on-tone,
  kept).
- **Cover row exists but the blob fetch fails** (revoked/deleted blob; `/file` 404/400) →
  today this paints the browser's native broken-image glyph. On the compare
  "which do you love more?" peak that violates the tone contract (TONE commitment 5; PRODUCT
  principle 5, "shown respectfully"). **Fix:** the three components handle `next/image`
  `onError` by degrading to the same initial-letter affordance, never the native glyph
  (minimal: an error flag that renders the existing `<span>` initial).
- **Accessible-name floor:** the card keeps a real accessible name in **both** photo and
  no-photo branches; `alt` stays `itemDisplayName(item)`. Fixing the weak name for
  unnamed+no-photo items (`#5` / `•`) is out of scope, but the test plan asserts the
  accessible name survives the branch.

## Open question for the design gate

Adding real photos to the results **"full ranking" 4-column grid** risks reading as the
catalog / "wall of thumbnails" that TONE.md commitment 3 names as an anti-reference.
`MostLovedHero` (one item, the affirmation peak) is squarely on-tone; the photo'd grid is the
tension. The `ui-ux-pro-max` gate must judge the **populated** grid specifically — not just a
single hero — and decide whether it shows photos, smaller photos, or stays letter-tiles. The
screenshots (below) must include the populated grid so this is visible.

## Testing (TDD; must run in CI)

**Bar (project policy, mem `testing-bar-routes-and-ui`):** ~20% baseline; every route and UI
element this change touches gets a real test in `npm run test:ci` (`vitest run`). The page
routes have **no tests today**, and **rendering an awaited async Server Component with RTL is a
net-new pattern here** — the 7 existing `vi.mock` tests are API-route handler tests that assert
on a `Response`, not component renders. Treat the page tests as new scaffolding, not
copy-paste.

**Route tests (new) — enumerate the mock set per page.** Mock the true boundaries
(`@/lib/auth` `getSession`, `@/lib/db` `getDb`, `next/navigation` `redirect`) **and** the repos
each page constructs, then `await` the page function and render the element with RTL
(`@vitest-environment jsdom`). Per page:

- **triage** — `requireCollectionAccess` (or its `CollectionRepository`+`MembershipRepository`),
  `ItemRepository.findByCollection`, `SessionRepository.findById`,
  `CollectionPreferenceItemRepository.findByCollection`, `PhotoRepository.findCoverPhotosByItemIds`.
- **compare** — as above plus the decisions repo it constructs.
- **results** — `requireCollectionAccess`, `SortResultRepository.findById`, the result-items
  repo, `ItemRepository.findByCollection`, the share repo, `PhotoRepository.findCoverPhotosByItemIds`.

Assertions per page:

- cover present → hero `<img>` whose `src` **contains `collection.id` and does NOT contain the
  slug**. Use a fixture where `id` and `slug` are distinct, non-substring values (e.g. id
  `coll_01ABC…`, slug `summer-bags`). **This is the slug-vs-id guard — it lives at the page
  layer, the only place the URL is built; the component can't enforce it.**
- no cover → no `<img>`, initial rendered, accessible name still present.
- covers batch-loaded once: `findCoverPhotosByItemIds` `toHaveBeenCalledTimes(1)` and the
  per-item photo method `not.toHaveBeenCalled()`.
- each test shown **RED** against current page code (no `heroPhotoUrl`) before green.

**Component tests — net-new cases only.** Image-with-hero is already covered
(`ItemCard.test.tsx:19`, `MostLovedHero.test.tsx:17`, `CompareChoice.test.tsx:21` — do not
duplicate). Add: `onError` → falls back to the initial (not the broken glyph); accessible name
present in the no-photo branch.

**Un-mocked seam test — the `/file` route authz (`RUN_DB_TESTS=1`).** The route tests mock
everything and the browser e2e (below) stubs `/file`, so nothing else crosses the `/file`
authorization seam un-mocked — the very invariant the root cause hinges on. Add a DB-backed
test against the real `items/[itemId]/photos/[photoId]/file` route (model: the existing
`pool/.../file/route.test.ts`) with a real seeded DB and only the blob `get` mocked: a slug in
the collection segment → 404; the correct `collection.id` → 200; **another tenant's
`collection.id` → 403 (IDOR)**. This is the test that proves the root-cause invariant and the
authorization end-to-end through the real DB.

**Real-browser e2e (folded in) — honest scope.** A Playwright triage test. It **stubs the
image**: `page.route("**/photos/*/file", …fulfill fixture)` intercepts in the *browser*, so the
server `/file` route never runs. The e2e therefore exercises the real page Server Component +
real seeded DB + real Next page routing, and asserts the browser requests the right URL — but
it does **not** cover `/file` blob-serving or authz (that's the un-mocked seam test above).
Assertions: the triage `<img>` renders (fails on broken code, which emits no `<img>` and hence
no `/file` request) **and**
`page.waitForRequest(u => u.includes('/file') && u.includes(<collection ULID>))`; shown red on
the pre-fix commit. Seeding: extend `e2e/fixtures/seed.ts` to create an item + a hero photo row
(`blobKey` a fixed placeholder — the browser intercepts before the server's blob fetch). CI:
the `e2e` job already runs on `e2e/**` / `src/app/**` / `src/features/**` changes (this touches
all); it runs ×3 device projects with retries — accepted cost.

### Test image fixtures (real CC0/public-domain)

~10 openly-licensed real photos under `e2e/fixtures/photos/` + a `LICENSES.md` (source URL +
license per file; Wikimedia Public-Domain/CC0; license verified before commit, anything
ambiguous dropped). **Allocation:** 1 fulfills the triage e2e interception; a handful populate
the light+dark screenshots (triage / compare / results incl. the full grid); the remainder are
staged for purses-bwr's public-image work — the shared fixtures dir is why they land here (per
the fold-in decision). Subject: handbags/purses where available, generic otherwise; realism
matters only for screenshots — tests assert presence, not content.

## Review gates (before merge)

`ui-ux-pro-max` (rendered UI — must judge the **populated results grid** for catalog tone),
then `adversarial-review`. The UI PR ships light+dark screenshots of triage, compare, and
results — **including a populated results grid and a no-photo/unnamed card** so the empty/
failure states and the catalog tension are visible (memory: `ui-prs-include-screenshots`).

## Review outcome (adversarial spec review, 2026-06-16)

Verdict **BLOCK → resolved in this revision.** Folded in:

- **e2e honesty + the un-mocked seam** (QA-F1/F2, Architect-F2, Craftsman-F5 — convergent): e2e
  stubs `/file`; added the DB-backed `/file` authz test (incl. IDOR); pinned the e2e assertions
  and required red-first.
- **page-layer slug-vs-id guard with distinct fixtures** (QA-F5, UX-F4 — convergent).
- **broken-image fallback** (UX-F1, Architect-F4 — convergent): `onError` → initial.
- **page render tests are a net-new pattern**; enumerated per-page mocks (QA-F4, Architect-F3).
- **components already done**; trimmed redundant component tests (QA-F3, Craftsman-F1,
  Architect-C7).
- **results-grid catalog tension** surfaced for the design gate (UX-F3); a11y name floor
  (UX-F2); image allocation justified (Craftsman-F3); file paths fully qualified (Architect-F1).

CLEAN (verified): `findCoverPhotosByItemIds` contract + non-null `itemId`; single-query, no
N+1 (`photos_item_id_idx`); "compare/results load no photos today"; the root-cause check; no
schema change in nkp; tokens/dark-theme unaffected; the e2e runs in CI for this change.
