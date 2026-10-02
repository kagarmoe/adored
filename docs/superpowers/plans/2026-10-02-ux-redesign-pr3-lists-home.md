# Adored UX redesign — PR 3 (lists and home) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track each task as a bead (`bd`, child of `purses-w7ss.3`), never TodoWrite.

**Goal:** The two list surfaces become familiar card grids with search and filter pills on top —
`/collections` a grid of cover-photo cards with an owner `···` menu, and the collection home
(`/collections/[id]`) the items grid itself, with **Start sorting** as the one primary action and an
**Add photos** pill beside it — and on phone that one action rides a fixed glass-strong bottom bar.

**Architecture:** One new layout primitive, `ActionBar` (`src/components/layout/ActionBar.tsx`): a
single DOM node that is an inline row from `md` up and a fixed glass-strong bar below `md`, paired
with `AppLayout`'s new `reserveActionBar` so nothing hides behind it. One new UI primitive,
`FilterPills` (extracted from PR 1's `ItemFilterPills`, which now delegates to it). The collections
list's rules are a pure module (`src/features/collections/collectionsList.ts`); the home reuses PR 1's
`filterItems` / `itemsEmptyState` / `ItemCard` / `ArchivedItemCard` unchanged. The items list page
retires to a guard-then-308 redirect to the home; every link that pointed at it is repointed in the
same task. No schema, no new API route: collection Archive / Bring back use the existing owner-only
`POST /api/collections/[id]/archive|restore`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Drizzle 0.45/Postgres, vitest + Testing
Library (jsdom/node), Playwright (WebKit tablet in CI).

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` — PR 3 = §8 item 3:
§5 "Lists and home" paragraph and its glass principle (glass-strong ≥ 0.85 with blur for the phone
bottom bar, at most three per screen), §6 (redirects: `page.tsx` after the DAL guard, enumeration
test updated in the same PR), §7 (every behaviour tested in CI at the cheapest tier; selected pill not
colour-only; CI e2e map check), §8 (light, dark and phone screenshots). Format and interface
reference: `docs/superpowers/plans/2026-10-01-ux-redesign-pr1-item-panel.md` (Task 7: items grid,
`ItemFilterPills`, `ArchivedItemCard`, `BringBackButton`, `RemovedItemNotice`) and
`docs/superpowers/plans/2026-10-01-ux-redesign-pr2-sort.md` (Task 11: `KeepSortingButton` on home;
`redirectRetired`).

## Global Constraints (from the spec and the governing docs)

- Lists and home: **search plus filter pills on top, card grid, overflow menus; a fixed bottom action
  bar on phone for the one primary action.** Collections list = grid of cover-photo cards; collection
  home = the items grid with **Start sorting** as the single primary action and an **Add photos** pill
  beside it.
- Glass that carries text over scrolling content (the phone bottom bar) is `--color-glass-strong`
  (≥ 0.85 opaque) with backdrop blur and the `rim` edge; **at most three glass-strong surfaces per
  screen**. Cards use the pre-composited `card` fill, no blur. No new tokens, no inline tints.
- Selected filter pill = `chip` fill + primary border + a check glyph, **never colour alone**.
- Exactly one dominant (`bg-primary`) action per screen. Taps primary; targets ≥ 44px (`h-11`);
  WCAG 2.1 AA in both themes.
- TONE: never count against the person (no "N items · M sorted"), no shopping language, no
  gamification; destructive actions sober and reversible where possible.
- Retired routes are `page.tsx` files that run the DAL guard **first**, then `permanentRedirect`;
  the page-authz enumeration test is updated in the same PR.
- Every test runs in CI. DB tier only for real DB crossings (this PR adds none beyond **one**
  member→guard→308 case in the enumeration backstop; the redirect's allow-list permutations are unit
  tests with `redirectRetired` mocked). E2E runs on tablet in CI; the phone bottom bar is
  viewport-sensitive, so its geometry is asserted in CI with `page.setViewportSize({ width: 390, height: 664 })`
  inside the tablet project (precedent: the wayfinding phone test), and the whole mapped spec also
  runs locally with `PW_VIEWPORT=phone` before the PR — tablet-only tests carry
  `test.skip(testInfo.project.name !== "tablet", …)` (precedent `e2e/a11y.spec.ts:94`) so that run
  passes by design.
- New UI-facing modules live under a CI-mapped path (`src/features/**`, `src/components/**`); a new
  `src/lib/<dir>` would be invisible to the e2e trigger (memory `ci-e2e-path-filters-hand-enumerated`).
  **Do not add `src/components/layout/**` to any area:** a `ui`-filter change that matches no area
  runs the FULL e2e suite (`matched=0`, `ci.yml` ~461), which is what a shared layout primitive
  deserves. `src/lib/collections/**` is not in the `ui` filter at all, so an area entry for it would be
  inert; the redirect is covered by the DB enumeration test and its unit test.
- Implementers do **not** run `graphify update .` (memory `sdd-implementers-must-not-run-graphify-update`);
  the controller runs it once at the PR boundary (Task 8).
- Commits end with the session attribution lines from the current system reminder. Do not push.

## Review Focus — five uncovered input classes (each pinned in its owning task)

1. **Odd search input on either list** — regex characters (`(`, `.*`), surrounding whitespace, a
   query over 100 characters, a repeated `?q=` key (arrives as `string[]`): plain-text,
   case-insensitive substring of the trimmed query, sliced to 100, an array ignored. Pinned: Task 2
   `collectionsList.test.ts` "searches name and description as plain text…"; Task 4 page test
   "ignores a repeated q key"; Task 5 home search test (repeated key → empty searchbox, 150 → 100);
   PR 1's `filterItems` tests (unchanged) for the home's matching.
2. **A stale, foreign or hostile "just archived" id** (`?removed=<id>` bookmarked, already restored,
   another user's collection or another collection's item, or a path like `../collections/<id>/archive#`)
   — no false "Archived." notice and **no Undo aimed at anything but the viewer's own archived thing**.
   Three layers: (a) `ArchivedNotice({ kind, id })` builds its restore URL itself with
   `encodeURIComponent(id)` — no caller ever passes a URL; (b) both lists verify `removed` server-side:
   id-shaped (`isIdShaped`) AND, on `/collections`, one of the viewer's **owned** collections that is
   archived now; on the home, an archived item **of this collection** (`listArchived(collection.id)`);
   anything else renders nothing; (c) the retired `/items` redirect copies `removed` only when it is
   id-shaped. Pinned: Task 3 "builds the restore URL from kind and id, encoded"; Task 4 "shows Undo
   only for the viewer's own collection that is archived now" (incl. archived-but-shared and a `../`
   value); Task 5 "shows the undo notice only for an archived item of this collection" (incl. a junk
   id and a `../` value); Task 6 redirect unit test (a `../` `removed` is dropped).
3. **A curator (non-owner) on the list or the home** — no `···` on their collection cards (Archive,
   settings and members are `collection:manage`), and the home menu offers only **Add item**.
   Pinned: Task 4 "owner cards get the ··· menu; a curator's card does not"; Task 5 "a curator's menu
   offers Add item only".
4. **The phone bar over content** — after scrolling to the bottom of a long grid the last card and the
   footer sit above the bar, the bar stays pinned to the viewport bottom, and on tablet the same bar
   is an inline row above the grid; a card row is visible on load at 390×664; the page's scroll
   padding matches the reserve so a focused bottom-row card is scrolled clear of the bar; on a short
   viewport (browser zoom) the bar is static, never two fixed bands. Pinned: Task 7 e2e "phone: the
   bar is pinned to the bottom and never hides the last row"; Task 4 unit "the bar goes static on a
   short viewport".
5. **Old links to the retired items list** (`/items?status=archived&q=tote&removed=<id>&utm=x`,
   `/items?q=a&q=b`, `/items?removed=../x`) keep their meaning on the home; unknown, malformed or
   non-id-shaped params are dropped; a stranger is still bounced by the guard first. Pinned: Task 6
   unit `items/page.test.tsx` "carries only the allow-listed view, query and an id-shaped notice" and
   the one DB crossing "the retired items list sends a member home through the guard".

## Decisions this plan takes where the spec is silent (call them out in review)

- **Collection card content.** Cover photo (4:3, the collection's existing cover), the name in
  Playfair (two lines max, full card width — the body is laid out for the 2-up phone grid), the
  description (two lines max), the existing "Photos waiting" cue (`rounded-pill`). **The status badge
  is dropped** (controller ruling, Graphic G1): the Archived pill already says it, the badge showed the
  raw enum, squeezed the name at 2-up, and its `archived` variant (`bg-hairline text-ink`) is 3.91:1 in
  dark — PR 3 would have been its first render. No new token. No counts, no dates, no "sorted"
  progress — the wireframe's "100 items · 38 sorted" is dropped. *Rationale:* TONE never counts; the
  photo leads.
- **Item card content on the home.** PR 1's `ItemCard` unchanged (cover, name or "Add a name", brand,
  one tier chip once sorted); **no overflow menu on item cards**. *Rationale:* Archive and Delete live
  on the item panel (§3); a second home for them would be a second path to the same action.
- **One grid rhythm.** Both grids are 2 columns on phone, 3 from `md`, 4 from `lg` (the collections
  grid was 1 column on phone). *Rationale:* the resale-app 2-up phone grid; one rhythm across lists.
- **Collections filter pills: All · Archived.** All = every collection that is **not archived**
  (so a `status: "deleted"` row without `deletedAt`, should one reach the list, is not silently
  hidden); Archived = archived ones. The old **Active** pill is folded into All, and `?status=active`
  (or any junk) reads as All. *Rationale:* mirrors the items pills; once Archive is reachable, an
  "All" that still lists archived collections would bury them back in.
- **Home filter pills: PR 1's set unchanged** (All, Archived, Waiting for a name), now linking to the
  home instead of `/items`.
- **Search behaviour (both lists).** A server-side GET form (`?q=`, ≤ 100 characters, a repeated key
  ignored) with a **Search** button — no as-you-type. Plain-text, case-insensitive substring of the
  trimmed query. Collections search name + description; items keep PR 1's fields. The query survives
  a pill change and the pill survives a search. *Rationale:* identical to PR 1's items list; works
  without client JS; stays a Server Component.
- **Collection card `···` (owner only):** **Collection settings**, **Members**, **Archive** (in the
  Archived view: **Bring back** instead). A curator's card has no `···`. No Delete on the card. The
  trigger is `OverflowMenu`'s `compact` variant (a 28px raised chip inside the 44px hit area) because
  it sits over the cover photo. *Rationale:* these are exactly the owner's existing
  `collection:manage` actions; permanent delete stays behind the type-the-name confirm on the settings page.
- **Archive undo.** Archive → `/collections?q=<current q>&removed=<id>` (the search survives; Archive is
  only offered in the All view, so there is no status to keep) and the same "Archived. You'll find it
  under Archived." notice with **Undo** that items use; PR 1's `RemovedItemNotice` is generalized to
  `ArchivedNotice({ kind: "item" | "collection", id })`, which **builds the restore URL itself** with
  `encodeURIComponent(id)` — never a raw URL prop (Security: an unchecked `?removed=` like
  `../collections/<id>/archive#` would otherwise turn Undo into a POST to another route). The notice
  renders only when `removed` is id-shaped and is one of the viewer's **owned** collections that is
  archived now. A failed Archive / Bring back keeps the card and shows "That didn't go through. Try
  again." (`rounded-control`) under the `···`. *Rationale:* §3's undo pattern, reused; Undo is always near.
- **Bring back from a card.** Bring back (Archived view) → `/collections?status=archived&q=<q>&restored=<id>`;
  the card leaves the list and a focused status line says "Brought back. It's under All."
  (`BroughtBackNotice`, rendered only for an id-shaped `restored` that is one of the viewer's owned
  collections and not archived). Never a bare `router.refresh()` — that dropped focus with no feedback.
- **Home `···` beside the title:** **Add item** (every member), **Collection settings** and
  **Members** (owner). *Rationale:* rarer actions behind an overflow (PRODUCT "Familiar first"), so
  the home keeps one primary and one pill.
- **Empty states.** Collections: no collections at all → "Nothing here yet" / "Start a new
  collection whenever you're ready — there's no rush." (the verb matches the bar's **New collection**;
  no button inside); Archived → "Nothing archived"; a search → "Nothing matches “q”" plus a quiet
  **Clear search** link (the same view without `q`); All empty but archived exist → "Nothing here right
  now" / "Your archived collections are under Archived." Home: PR 1's `itemsEmptyState` copy plus one
  new branch — every item archived → "Everything here is archived" / "Find it under Archived." — **without
  a button** (the bar carries the action), and the same quiet **Clear search** link after a
  zero-result search; a home with pool photos but no items shows the "Photos waiting" strip instead
  of an empty state.
- **What the bar shows.** `/collections`: **New collection**. Home: **Start sorting** / **Keep
  sorting** (primary) + **Add photos** pill once the collection has a live item or an open sort;
  **Make items** (primary → pool) alone when only pool photos exist; **Add photos** (primary → pool)
  alone when the collection is empty. No other screen gets a bar in PR 3 (panel, Sort, Ranking are
  unchanged). *Rationale:* §5's one primary action; Start sorting needs something to sort.
- **Phone bar mechanics.** Fixed below `md` (768px). That is every phone; it is also iPad mini
  portrait (744) and iPad Split View panes, which get the phone bar — acceptable, since below 768 the
  inline row would wrap anyway; standard iPads in portrait (810+) keep the inline row.
  `bg-glass-strong backdrop-blur-md border-t border-rim shadow-lift`, plain `pt-3 pb-3` (no
  `env(safe-area-inset-bottom)`: the root layout sets no `viewportFit: "cover"`, so the inset is
  always 0 — no safe-area claim), `z-30` (under the header's `z-40` and the overflow menu's `z-50`).
  **Short viewports** (`max-height: 500px`, i.e. browser zoom) make the bar static — never two
  fixed bands eating the screen. `AppLayout reserveActionBar` pads the page bottom (`pb-36 md:pb-0`,
  9rem: the bar plus a two-line AsyncActionButton error line, so the error never grows the bar past
  the reserve), and a `globals.css` rule sets `scroll-padding-bottom: 9rem` on `html` while a
  `[data-action-bar]` is fixed, so a keyboard-focused bottom-row card is scrolled clear of the bar.
  Inside the bar the primary stretches `w-full md:w-auto` (AsyncActionButton's `fullWidth`
  breakpoint moves `sm` → `md`; the home's KeepSortingButton is its only caller), so at 640–767 the
  fixed bar's primary still fills. Glass-strong surfaces per screen: header + bar = 2. **No 3-tab
  bottom nav** (the phone wireframe's Home/Sort/You): the spec chose an action bar. The bar's top edge
  over white photos in light mode is accepted as is (controller ruling G2; no upward-shadow token).
- **Tablet placement of the primary action.** The same `ActionBar` node renders inline: on
  `/collections` at the right of the title row (where New collection is today); on the home as its own
  left-aligned row after the header group (title, description, `···`, and the chip row — chips plus
  **See your ranking** — held together at `space-y-2`, then a visual break), above search — visible
  without scrolling, and first in tab order after the chip row.
- **Phone home above the fold.** The home stack is `space-y-4 md:space-y-8`, the search label is
  `max-md:sr-only` (the accessible name "Search your items" stays), and See your ranking rides the chip
  row, so at 390×664 a card row is visible on load without scrolling.
- **Pool strip.** `PhotoPoolPreview` stays as a "Photos waiting" strip above the grid (All view, no
  query, ≥ 1 loose photo). Its **Make items** link shows only when sorting holds the primary (so the
  name is never on screen twice); in the photos-only state (bar primary = Make items) the thumbnail
  strip is itself **one link to the pool, labelled by the "Photos waiting" heading**, so the visible
  "Make items" text still appears once. Its "Add more photos" link is dropped (the Add photos pill does it).
- **The whole collection on the home.** The 12-item preview bound goes; the home lists every live
  item in number order (`listItems(collection.id, { orderBy: "number" })` — the repository only sorts
  when asked). Covers are batch-read for every visible item — an **unbounded fan-out** (one
  `findCoverPhotosByItemIds` over N ids, all of each item's photos) accepted for PR 3; a follow-up bead
  (controller files it) narrows it to one hero-first row per item (`DISTINCT ON`). `next/image`
  lazy-loads. Paging is deferred until a collection is big enough to need it. The now-unused `limit`
  option (`FindByCollectionOptions.limit`, `ItemController.listItems`'s stale comment) and its DB
  tests are deleted; `orderBy` and its tie-break DB test stay.
- **Kept on the home:** the Build/Sort/Decide mode chips (navigation, not an action; removing them is
  outside §8 item 3) and PR 2's quiet **See your ranking** link, now on the chip row with the same
  visibility rule. The chips' Sort/Decide overlap with Start sorting / See your ranking is recorded
  (affordance table) and deferred to a bead (controller ruling F6). **Dropped:** the "Created {date}"
  line (chrome, not the objects). Item cards carry no `···`, and a single-item curator's home `···`
  holding only **Add item** is accepted (controller ruling F12).
- **Collection card zoom dropped.** The "View photo" lightbox control leaves collection cards (the
  `···` takes that corner; a collection cover is not a decision moment; zoom stays on the item panel).
- **Retired routes and redirects.** `/collections/[id]/items` (the list only) → 308 to
  `/collections/[id]` after the guard, carrying only `status=archived`, `unnamed=1`, `q` (≤ 100) and
  an id-shaped `removed` (`isIdShaped`: `^[a-z]+_[0-9a-z]{1,40}$`); anything else is dropped. Item URLs (`/items/[n]`, `/items/new`) are unchanged. The panel's
  not-found redirect, the non-numeric `…/edit` and `…/photos` bounces, archive's landing, the pool's
  "see them all" notice and the Ranking's number-less fallback all point at the home. Breadcrumbs lose
  the "Items" level: an item reads Collections / {collection} / {item}.
- **Deleted modules:** `workspaceState.ts` (+ test) and `ItemPreviewGrid.tsx` — the home no longer has
  adaptive layouts, only the three primary-action states above, expressed inline. Also deleted: the
  `limit` path of `findByCollection` / `FindByCollectionOptions.limit` and the two `limit`-only DB tests
  in `src/lib/db/workspace-preview.integration.test.ts` ("returns only the preview slice…", "resolves
  covers only for the displayed item ids…").
- **E2E shape.** One new spec, `e2e/lists-and-home.spec.ts`, replaces
  `e2e/adaptive-collection-workspace.spec.ts` (its two wayfinding tests move over, tablet-only one
  gaining the project skip). The CI area map only swaps the spec name in the `collection` and `items`
  selections — **no new area paths** (see Global Constraints: an unmapped `src/components/layout/**`
  change already runs the full suite).
- **`FilterPills` check glyph.** `CheckIcon` moves from `src/features/items/InYourLifeChip.tsx` to
  `src/components/ui/CheckIcon.tsx` and is reused by `FilterPills` and `InYourLifeChip` (one glyph).

### Owner veto (data-changing or route-retiring — flag in the PR body)

1. **`/collections/[id]/items` retires** to a 308 redirect to the collection home (old links and
   bookmarks keep their filter, query and undo notice).
2. **Collection Archive / Bring back reach the UI** for the first time (the owner-only routes existed
   with no caller). Archiving flips `collections.status`; it is reversible from the Archived pill and
   the Undo notice. With it, **All stops listing archived collections** and the Active pill goes.

### Rulings (controller)

- **G2 accepted:** the phone bar's top edge over white photos in light mode stays as is — no
  upward-shadow token.
- **UX F12 accepted:** a curator's home `···` holding only **Add item** is fine; no change.
- **A4 deferred to a bead:** the home's unbounded cover fan-out (every visible item's photos) ships;
  a follow-up narrows it to one hero-first row per item (`DISTINCT ON`).
- **G3 deferred to a bead:** `PoolActionBar` (the pool's bottom bar) diverges from `ActionBar`;
  aligning them is a follow-up, no change in PR 3.
- **F6 deferred to a bead:** the Sort/Decide mode chips overlap Start sorting / See your ranking on
  the home; resolving the duplication is a follow-up (the chip row now sits with the header group).
- **G1 ruled:** drop the status badge from collection cards; no new token.

### Rejected review findings

- **A5 + Q9 (in part) — delete the "workspace item preview" DB tests L240–275 wholesale:** the
  tie-break test ("breaks number ties by id ascending", L255) pins `orderBy: "number"`'s SQL ordering
  of nullable `number` — exactly the SQL-semantics crossing the DB tier exists for, and the home now
  relies on `orderBy` (A2). It stays, with its `limit: 12` argument removed. The `limit`-only tests
  (L240 slice, L275 covers-for-displayed) are deleted as asked.
- **G7 (in part) — `flex-wrap … grow basis-24` on the collection card's name row:** that layout
  exists in `ItemCard` to share the row with a tier badge; with the status badge dropped (G1) the name
  is alone on its row, so it takes the full body width (`min-w-0 break-words line-clamp-2`) with no
  flex wrapper. The `p-3` body and `rounded-full` → `rounded-pill` parts are applied.

### Affordances on the surfaces that change (PR 1 lesson: rule on each, nothing lost silently)

| Surface → affordance | Ruling |
|---|---|
| `/collections` New collection button | **Move** into the `ActionBar` (inline on tablet, bottom bar on phone) |
| `/collections` All / Active / Archived pills | **Change** to All / Archived (`FilterPills`); Active folds into All |
| Collection card cover "View photo" lightbox | **Drop** (decision above) |
| Collection card "Photos waiting" cue | **Keep** (`rounded-pill`) |
| Collection card status badge | **Drop** (ruling G1: the Archived pill says it; dark-mode contrast; raw enum) |
| `/collections` empty-state "Begin a collection" button | **Drop** from the empty state; the bar holds it (copy: "Start a new collection whenever you're ready…") |
| Zero-result search (both lists) | **Add** a quiet **Clear search** link (same view, no `q`) |
| Card Bring back feedback | **Change**: was a silent refresh; now lands on the Archived view with a focused "Brought back. It's under All." |
| `/collections` first-run `/welcome` redirect | **Keep** (unchanged, before any render) |
| Home pool preview: Make items, Add more photos | **Change**: strip keeps thumbnails; Make items = bar primary when no items, else the strip's quiet link; Add more photos → the Add photos pill |
| Home 12-item preview + "View all items" | **Change**: the full grid; the link drops |
| Home "Add item" quiet link | **Move** into the home `···` |
| Home Start / Keep sorting | **Move** into the `ActionBar` (primary) |
| Home "See your ranking" | **Move** onto the chip row (same rule) |
| Home owner nav: Collection settings, Members | **Move** into the home `···` (owner only) |
| Home Build/Sort/Decide chips, description | **Keep** (chip row joins the header group) |
| Home Sort/Decide chips vs Start sorting vs See your ranking (two paths to Sort and to the Ranking) | **Out of scope** — recorded; follow-up bead (ruling F6) |
| Home "Created {date}" | **Drop** |
| Items list: search, pills, grid, tier chip, Archived + Bring back, undo notice | **Move** to the home |
| Items list "Add photos" / "Add item" buttons | **Move**: Add photos pill in the bar; Add item in the `···` |
| Items list view subtitle ("All", "Archived", …) | **Drop** (the selected pill says it) |

## File map

| Area | Create | Modify | Delete |
|---|---|---|---|
| Primitives | `src/components/ui/FilterPills.tsx` (+test), `src/components/ui/CheckIcon.tsx` (moved), `src/components/layout/ActionBar.tsx` | `src/components/ui/index.ts`, `src/features/items/InYourLifeChip.tsx`, `src/components/layout/AppLayout.tsx`, `src/app/globals.css` (scroll padding), `src/lib/design/contrast.test.ts` (one pair), `src/features/items/ItemFilterPills.tsx` (+test) | — |
| Collections list | `src/features/collections/collectionsList.ts` (+test), `src/features/collections/CollectionCardMenu.tsx` (+test), `src/features/collections/BroughtBackNotice.tsx`, `src/app/collections/page.test.tsx` | `src/app/collections/page.tsx`, `src/features/collections/CollectionCard.tsx` (+test) | `src/features/collections/CollectionFilters.tsx` |
| Undo notice | `src/features/items/ArchivedNotice.tsx` (+test, `git mv` from `RemovedItemNotice`) | `src/lib/id.ts` (`isIdShaped`), `src/app/collections/[id]/items/page.tsx` (until Task 6) | `RemovedItemNotice.tsx` (+test) |
| Home | `src/features/collections/CollectionHomeMenu.tsx` | `src/app/collections/[id]/page.tsx` (+test), `src/features/collections/PhotoPoolPreview.tsx`, `src/lib/items.ts` (+test), `src/features/sorting/AsyncActionButton.tsx` (`fullWidth` → `md`), `src/server/api/items.ts`, `src/server/repositories/implementations/ItemRepository.ts`, `src/lib/db/workspace-preview.integration.test.ts` | `ItemPreviewGrid.tsx`, `workspaceState.ts` (+test), the `limit` option + its two DB tests |
| Retire `/items` | — | `src/app/collections/[id]/items/page.tsx` (→ redirect) + `page.test.tsx` (rewritten as the redirect's unit test), `src/lib/collections/retired-redirect.ts`, `…/items/[itemNumber]/{page,edit/page,photos/page}.tsx`, `ItemOverflowMenu.tsx` (+test), `PoolPhotoGrid.tsx` (+test), `src/app/collections/[id]/results/page.tsx`, `breadcrumb-trails.ts` (+test), `page-authz-enumeration.integration.test.ts` | — |
| E2E / CI | `e2e/lists-and-home.spec.ts` | `e2e/fixtures/seed.ts`, `e2e/item-panel.spec.ts`, `e2e/a11y.spec.ts`, `e2e/image-perf.spec.ts`, `e2e/screenshots/capture.ts`, `.github/workflows/ci.yml` (spec names only) | `e2e/adaptive-collection-workspace.spec.ts` |
| Docs | — | `DESIGN.md` §5, `docs/ARCHITECTURE.md` (decision 23 status, new decision 43) | — |

---

## Task 1: `FilterPills` primitive; `ItemFilterPills` delegates and takes a full path

**Files:** Create `src/components/ui/FilterPills.tsx`, `src/components/ui/FilterPills.test.tsx`,
`src/components/ui/CheckIcon.tsx` (moved out of `InYourLifeChip`). Modify `src/components/ui/index.ts`,
`src/features/items/InYourLifeChip.tsx`, `src/features/items/ItemFilterPills.tsx`,
`src/features/items/ItemFilterPills.test.tsx`, `src/app/collections/[id]/items/page.tsx` (one prop).

**Interfaces:**
- Produces: `interface FilterPill { label: string; href: string; current: boolean }`;
  `FilterPills({ label, pills }: { label: string; pills: FilterPill[] })` — a `<nav aria-label={label}>`
  of pill links; the current one has `aria-current="page"` and a check `<svg>`.
- Produces: `itemsViewHref(path: string, view: ItemsView, q: string): string` — `path` is the **full
  list path** (no `/items` appended); `ItemFilterPills({ path, view, q })`.

- [ ] **Step 1: Failing tests.** `src/components/ui/FilterPills.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterPills } from "./FilterPills";

describe("FilterPills", () => {
  it("marks the current pill with aria-current and a check glyph, never colour alone", () => {
    render(
      <FilterPills
        label="Filter things"
        pills={[
          { label: "All", href: "/things", current: false },
          { label: "Archived", href: "/things?status=archived", current: true },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Filter things" })).toBeInTheDocument();
    const archived = screen.getByRole("link", { name: "Archived" });
    expect(archived).toHaveAttribute("aria-current", "page");
    expect(archived.querySelector("svg")).not.toBeNull();
    const all = screen.getByRole("link", { name: "All" });
    expect(all).not.toHaveAttribute("aria-current");
    expect(all.querySelector("svg")).toBeNull();
    expect(all).toHaveAttribute("href", "/things");
  });
});
```

Replace the body of `src/features/items/ItemFilterPills.test.tsx` (the a11y half now lives above):

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilterPills } from "./ItemFilterPills";

describe("ItemFilterPills", () => {
  it("links each view under the given path and keeps the query", () => {
    render(<ItemFilterPills path="/collections/bags" view="archived" q="tote" />);
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/collections/bags?q=tote");
    expect(screen.getByRole("link", { name: "Waiting for a name" })).toHaveAttribute(
      "href",
      "/collections/bags?unnamed=1&q=tote",
    );
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/ui/FilterPills.test.tsx src/features/items/ItemFilterPills.test.tsx`
  → FAIL (`FilterPills` does not exist; `path` prop unknown, hrefs still carry `/items`).

- [ ] **Step 3: Implement.** Move the check glyph: create `src/components/ui/CheckIcon.tsx` with the
`CheckIcon` function cut **verbatim** from `src/features/items/InYourLifeChip.tsx` (export it), and in
`InYourLifeChip.tsx` delete the local definition and `import { CheckIcon } from "@/components/ui/CheckIcon";`.
`grep -rn "CheckIcon" src` → only `components/ui/CheckIcon.tsx`, `components/ui/FilterPills.tsx`,
`features/items/InYourLifeChip.tsx`.

`src/components/ui/FilterPills.tsx`:

```tsx
import Link from "next/link";
import { CheckIcon } from "./CheckIcon";

export interface FilterPill {
  label: string;
  href: string;
  current: boolean;
}

// Filter pills (DESIGN.md §5): 44px, pill radius; the current one is chip fill +
// primary border + a check glyph, never colour alone. Links, so a filter is a URL.
export function FilterPills({ label, pills }: { label: string; pills: FilterPill[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {pills.map((pill) => (
          <li key={pill.href}>
            <Link
              href={pill.href}
              aria-current={pill.current ? "page" : undefined}
              className={`inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm no-underline ${pill.current ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline bg-glass text-ink"}`}
            >
              {pill.current && <CheckIcon />}
              {pill.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/components/ui/index.ts` — append:

```ts
export { FilterPills, type FilterPill } from "./FilterPills";
```

`src/features/items/ItemFilterPills.tsx` — replace the file:

```tsx
import { FilterPills } from "@/components/ui";

export type ItemsView = "all" | "archived" | "unnamed";
const PILLS: [ItemsView, string][] = [["all", "All"], ["archived", "Archived"], ["unnamed", "Waiting for a name"]];

/** `path` is the list's own path (the collection home since PR 3). */
export function itemsViewHref(path: string, view: ItemsView, q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (view === "unnamed") p.set("unnamed", "1");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

export function ItemFilterPills({ path, view, q }: { path: string; view: ItemsView; q: string }) {
  return (
    <FilterPills
      label="Filter items"
      pills={PILLS.map(([v, label]) => ({ label, href: itemsViewHref(path, v, q), current: v === view }))}
    />
  );
}
```

In `src/app/collections/[id]/items/page.tsx` change
`<ItemFilterPills base={collectionHref} view={view} q={q} />` to
`<ItemFilterPills path={`${collectionHref}/items`} view={view} q={q} />` (the page retires in Task 6).

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run "src/app/collections/[id]/items" src/features/items` → PASS (InYourLifeChip unchanged in behaviour); `npx tsc --noEmit` → clean.
- [ ] **Step 5:** `git add src/components/ui/FilterPills.tsx src/components/ui/FilterPills.test.tsx src/components/ui/CheckIcon.tsx src/components/ui/index.ts src/features/items/InYourLifeChip.tsx src/features/items/ItemFilterPills.tsx src/features/items/ItemFilterPills.test.tsx "src/app/collections/[id]/items/page.tsx" && git commit -m "refactor(ui): FilterPills primitive with the shared CheckIcon; item pills take the list path"`

## Task 2: Collections list rules (pure)

**Files:** Create `src/features/collections/collectionsList.ts`, `src/features/collections/collectionsList.test.ts`.

**Interfaces:**
- Produces: `type CollectionsView = "all" | "archived"`; `COLLECTION_PILLS: [CollectionsView, string][]`;
  `collectionsViewFrom(status: unknown): CollectionsView`; `collectionsViewHref(view: CollectionsView, q: string): string`;
  `filterCollections(collections: Collection[], opts: { view: CollectionsView; q: string }): Collection[]`;
  `collectionsEmptyState(opts: { hasAny: boolean; view: CollectionsView; q: string }): { heading: string; message: string }`.

- [ ] **Step 1: Failing test** `src/features/collections/collectionsList.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Collection } from "@/types";
import { collectionsEmptyState, collectionsViewFrom, collectionsViewHref, filterCollections } from "./collectionsList";

const mk = (o: Partial<Collection>): Collection => ({
  id: "c", ownerId: "u", name: "Bags", slug: null, description: null, status: "active",
  createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null, ...o,
});
const ids = (cs: Collection[]) => cs.map((c) => c.id);
const list = [
  mk({ id: "a", name: "Summer bags", description: "Totes (canvas) and clutches" }),
  mk({ id: "b", name: "Grandma's china", status: "archived" }),
  mk({ id: "c", name: "Books" }),
  mk({ id: "d", name: "Odd one", status: "deleted" }),
];

describe("filterCollections", () => {
  it("All is everything not archived (never silently hides a status); Archived is the archived ones", () => {
    expect(ids(filterCollections(list, { view: "all", q: "" }))).toEqual(["a", "c", "d"]);
    expect(ids(filterCollections(list, { view: "archived", q: "" }))).toEqual(["b"]);
  });
  it("searches name and description as plain text, case-insensitive, trimmed — never a pattern", () => {
    expect(ids(filterCollections(list, { view: "all", q: "  TOTES (" }))).toEqual(["a"]);
    expect(ids(filterCollections(list, { view: "all", q: "books" }))).toEqual(["c"]);
    expect(filterCollections(list, { view: "all", q: ".*" })).toEqual([]);
  });
  it("search stays inside the chosen view", () => {
    expect(filterCollections(list, { view: "archived", q: "summer" })).toEqual([]);
  });
});

describe("collectionsViewFrom / collectionsViewHref", () => {
  it("only archived is a view; the retired Active, arrays and junk read as All", () => {
    expect(collectionsViewFrom("archived")).toBe("archived");
    for (const s of ["active", "", undefined, ["archived"], "ARCHIVED"]) expect(collectionsViewFrom(s)).toBe("all");
  });
  it("keeps the query across pills", () => {
    expect(collectionsViewHref("all", "")).toBe("/collections");
    expect(collectionsViewHref("archived", "china")).toBe("/collections?status=archived&q=china");
  });
});

describe("collectionsEmptyState", () => {
  it("speaks gently per case and never counts", () => {
    expect(collectionsEmptyState({ hasAny: true, view: "all", q: " silk " }).heading).toBe("Nothing matches “silk”");
    expect(collectionsEmptyState({ hasAny: true, view: "archived", q: "" }).heading).toBe("Nothing archived");
    expect(collectionsEmptyState({ hasAny: false, view: "all", q: "" })).toEqual({
      heading: "Nothing here yet",
      message: "Start a new collection whenever you’re ready — there’s no rush.",
    });
    expect(collectionsEmptyState({ hasAny: true, view: "all", q: "" })).toEqual({
      heading: "Nothing here right now",
      message: "Your archived collections are under Archived.",
    });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/features/collections/collectionsList.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/features/collections/collectionsList.ts`:

```ts
import type { Collection } from "@/types";

export type CollectionsView = "all" | "archived";
export const COLLECTION_PILLS: [CollectionsView, string][] = [["all", "All"], ["archived", "Archived"]];

/** `?status=archived` is the only non-default view; the retired "active" and anything else is All. */
export function collectionsViewFrom(status: unknown): CollectionsView {
  return status === "archived" ? "archived" : "all";
}

export function collectionsViewHref(view: CollectionsView, q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `/collections${qs ? `?${qs}` : ""}`;
}

/** All = not archived (no status is silently hidden), Archived = archived; plain-text
 *  search (never a pattern) over name and description. */
export function filterCollections(
  collections: Collection[],
  opts: { view: CollectionsView; q: string },
): Collection[] {
  const wantArchived = opts.view === "archived";
  const needle = opts.q.trim().toLocaleLowerCase();
  return collections.filter(
    (c) =>
      (c.status === "archived") === wantArchived &&
      (!needle || [c.name, c.description].some((text) => text?.toLocaleLowerCase().includes(needle))),
  );
}

export function collectionsEmptyState(opts: { hasAny: boolean; view: CollectionsView; q: string }) {
  const q = opts.q.trim();
  if (q) return { heading: `Nothing matches “${q}”`, message: "Try another word, or clear the search." };
  if (opts.view === "archived")
    return { heading: "Nothing archived", message: "Collections you archive rest here, ready to come back whenever you like." };
  if (!opts.hasAny)
    return { heading: "Nothing here yet", message: "Start a new collection whenever you’re ready — there’s no rush." };
  return { heading: "Nothing here right now", message: "Your archived collections are under Archived." };
}
```

- [ ] **Step 4:** Step 2 command → PASS.
- [ ] **Step 5:** `git add src/features/collections/collectionsList.ts src/features/collections/collectionsList.test.ts && git commit -m "feat(collections): list rules — All (not archived)/Archived views, plain-text search, gentle empty states"`

## Task 3: Collection card `···` (owner), the shared Archived notice, and the id-shape guard

**Files:** Create `src/features/collections/CollectionCardMenu.tsx`,
`src/features/collections/CollectionCardMenu.test.tsx`, `src/features/collections/BroughtBackNotice.tsx`.
Modify `src/features/collections/CollectionCard.tsx`, `src/features/collections/CollectionCard.test.tsx`,
`src/lib/id.ts` (no new test: see Step 1).
`git mv` `src/features/items/RemovedItemNotice.tsx` → `src/features/items/ArchivedNotice.tsx` and its
test → `ArchivedNotice.test.tsx`; modify both; modify `src/app/collections/[id]/items/page.tsx` (the
notice call) and the comment in `src/features/items/ItemOverflowMenu.tsx` that names `RemovedItemNotice`.

**Interfaces:**
- Produces: `isIdShaped(value: unknown): value is string` in `src/lib/id.ts` — `^[a-z]+_[0-9a-z]{1,40}$`
  (every `generateId` id, and the short test ids like `item_9`, `col_a`); no `/`, `.`, `#`, `?`, `%`.
- Produces: `CollectionCard({ collection, coverPhotoUrl?, hasPooledPhotos?, menu? })` — `menu?: React.ReactNode`
  renders top-right above the stretched link; **`viewerPhoto` is removed**; **no status badge**.
- Produces: `CollectionCardMenu({ collectionId, name, href, archived, q })` — `collectionId` is the ULID
  (the API takes the id), `href` is `/collections/{slug ?? id}`, `q` the list's current query; trigger
  label `More for {name}` (`compact`); items `Collection settings`, `Members`, then `Archive` or
  `Bring back`. Archive success → `router.push("/collections?q={q}&removed={collectionId}")` (`q` omitted
  when empty); Bring back success → `router.push("/collections?status=archived&q={q}&restored={collectionId}")`;
  failure → `role="alert"` "That didn’t go through. Try again." (`rounded-control`).
- Produces: `ArchivedNotice({ kind, id }: { kind: "item" | "collection"; id: string })` — same copy and
  behaviour as PR 1's `RemovedItemNotice` (focus on mount, Undo → POST
  `/api/{items|collections}/{encodeURIComponent(id)}/restore` → strip `removed`, Done → strip `removed`).
  **No URL prop** — callers can never aim Undo at another route.
- Produces: `BroughtBackNotice()` — a focused `role="status"` line "Brought back. It’s under All."

- [ ] **Step 1: Failing tests.** `src/features/collections/CollectionCardMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { CollectionCardMenu } from "./CollectionCardMenu";

const props = { collectionId: "col_1", name: "Summer bags", href: "/collections/summer-bags", q: "tote" };
const open = () => fireEvent.click(screen.getByRole("button", { name: "More for Summer bags" }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("CollectionCardMenu", () => {
  it("offers settings, members and Archive; Archive keeps the search and lands with the undo notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Collection settings", "Members", "Archive"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections?q=tote&removed=col_1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/col_1/archive", { method: "POST" });
  });

  it("in the Archived view offers Bring back, which lands on the same view with the brought-back line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<CollectionCardMenu {...props} q="" archived />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Bring back" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections?status=archived&restored=col_1"));
    expect(fetch).toHaveBeenCalledWith("/api/collections/col_1/restore", { method: "POST" });
    expect(refresh).not.toHaveBeenCalled(); // a bare refresh dropped focus with no feedback
  });

  it("a failed archive stays put and says so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn’t go through. Try again.");
    expect(push).not.toHaveBeenCalled();
  });

  it("settings and members navigate by the slug path", () => {
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Members" }));
    expect(push).toHaveBeenCalledWith("/collections/summer-bags/members");
  });
});
```

In `src/features/collections/CollectionCard.test.tsx` delete the two `viewerPhoto` tests ("renders a
'View photo' control…" and "renders no 'View photo' control…") and add to `describe("CollectionCard images")`:

```tsx
  it("renders the menu slot alongside the single navigating link, and no status badge", () => {
    render(
      <CollectionCard
        collection={{ ...collection, status: "archived" } as any}
        menu={<button type="button">More</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /view photo/i })).not.toBeInTheDocument();
    expect(screen.queryByText("archived")).not.toBeInTheDocument(); // the Archived pill says it
  });
```

Rename the notice: `git mv src/features/items/RemovedItemNotice.tsx src/features/items/ArchivedNotice.tsx`
and `git mv src/features/items/RemovedItemNotice.test.tsx src/features/items/ArchivedNotice.test.tsx`.
In the test, replace the import with `import { ArchivedNotice } from "./ArchivedNotice";`, every
`<RemovedItemNotice itemId="…" />` render with `<ArchivedNotice kind="item" id="<same id>" />`
(the existing tests keep asserting `/api/items/<id>/restore`), and add **one** test:

```tsx
  it("builds the restore URL from kind and id, encoded — a hostile id cannot aim Undo elsewhere", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<ArchivedNotice kind="collection" id="../col_9/archive#" />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/collections/..%2Fcol_9%2Farchive%23/restore", { method: "POST" }),
    );
  });
```

(Import `fireEvent`/`waitFor`/`vi` if the file does not already; unstub globals in an `afterEach`.)

`isIdShaped` needs no separate test (a one-line regex): it is exercised by the Task 4, 5 and 6 tests
that feed it a `../` value.

- [ ] **Step 2:** `npx vitest run src/features/collections src/features/items/ArchivedNotice.test.tsx` → FAIL
  (`CollectionCardMenu` missing; `menu` slot not rendered; badge still rendered; `ArchivedNotice` export missing).

- [ ] **Step 3: Implement.** `src/lib/id.ts` — append:

```ts
/** A value shaped like one of our ids (`prefix_` + lowercase base32). URL params that
 *  name an id (`?removed=`, `?restored=`) pass this before they are used or copied. */
export function isIdShaped(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+_[0-9a-z]{1,40}$/.test(value);
}
```

`src/features/collections/CollectionCardMenu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OverflowMenu, type OverflowMenuItem } from "@/components/ui";

interface CollectionCardMenuProps {
  /** ULID — the archive/restore routes take the id, never the slug. */
  collectionId: string;
  name: string;
  /** `/collections/{slug ?? id}`. */
  href: string;
  archived: boolean;
  /** The list's current search, kept across the landing. */
  q: string;
}

// Rendered for the owner only: every action here is collection:manage server-side.
// Archive is the existing reversible status flip; its Undo waits on the list
// (ArchivedNotice, keyed by ?removed=). Bring back lands on the same Archived view with
// a focused "Brought back" line (BroughtBackNotice, keyed by ?restored=) — the card
// leaves the list, so a bare refresh would drop focus silently. Permanent delete stays
// on the settings page.
export function CollectionCardMenu({ collectionId, name, href, archived, q }: CollectionCardMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(action: "archive" | "restore") {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/collections/${collectionId}/${action}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    const p = new URLSearchParams();
    if (action === "restore") p.set("status", "archived");
    if (q) p.set("q", q);
    p.set(action === "archive" ? "removed" : "restored", collectionId);
    router.push(`/collections?${p}`);
  }

  const items: OverflowMenuItem[] = [
    { label: "Collection settings", onSelect: () => router.push(`${href}/edit`) },
    { label: "Members", onSelect: () => router.push(`${href}/members`) },
    archived
      ? { label: "Bring back", onSelect: () => void post("restore"), disabled: busy }
      : { label: "Archive", onSelect: () => void post("archive"), disabled: busy },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      {/* compact: a raised 28px chip over the cover photo, 44px hit area */}
      <OverflowMenu label={`More for ${name}`} items={items} compact />
      {failed && (
        <p role="alert" className="rounded-control bg-surface-raised px-3 py-1 text-sm text-ink shadow-lift">
          That didn’t go through. Try again.
        </p>
      )}
    </div>
  );
}
```

`src/features/collections/BroughtBackNotice.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

// After Bring back from a card in the Archived view the card leaves this list, so focus
// lands here and says where it went (a server-rendered live region is not announced on
// a fresh navigation; the focus move is). The page renders it only for a verified id.
export function BroughtBackNotice() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <p ref={ref} tabIndex={-1} role="status" className="rounded-card bg-surface p-4 text-sm text-ink ring-1 ring-hairline outline-hidden">
      Brought back. It&rsquo;s under All.
    </p>
  );
}
```

`src/features/collections/CollectionCard.tsx` — replace the props, drop the `Badge` and
`PhotoViewControl` imports (keep `Card`), and the two edges of the JSX:

```tsx
import type { Collection } from "@/types";
import { Card } from "@/components/ui";
import Image from "next/image";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  coverPhotoUrl?: string;
  /** Calm, informational cue that loose photos are waiting in this collection's pool. */
  hasPooledPhotos?: boolean;
  /** The owner's ··· menu (CollectionCardMenu); absent for a curator. */
  menu?: React.ReactNode;
}

export function CollectionCard({ collection, coverPhotoUrl, hasPooledPhotos, menu }: CollectionCardProps) {
```

Keep the cover block as it is. The body is laid out for the 2-up phone grid: padding `p-5` → `p-3`,
and the name row loses its flex wrapper and the status badge (the Archived pill says it):

```tsx
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="min-w-0 break-words font-display text-lg text-ink line-clamp-2">{collection.name}</h3>
```

(the description and the "Photos waiting" cue stay; on the cue `rounded-full` → `rounded-pill`). Replace
the last two lines inside `<Card>` (the `<Link>` stays; the `PhotoViewControl` line goes) with:

```tsx
      <Link
        href={`/collections/${collection.slug ?? collection.id}`}
        className="absolute inset-0 z-10"
        aria-label={collection.name}
      />
      {menu && <div className="absolute right-2 top-2 z-20">{menu}</div>}
```

and update the stretched-link comment to name the menu instead of the view control.

`src/features/items/ArchivedNotice.tsx` — rename the component and props; body otherwise unchanged:

```tsx
interface ArchivedNoticeProps {
  kind: "item" | "collection";
  id: string;
}

// The undo half of an archive (an item from its panel, a collection from its card):
// the archiving surface lands on the list with ?removed=<id>; this notice …(keep the rest of the comment)
// The restore URL is built HERE from kind + an encoded id — never passed in — so a
// hostile ?removed= (e.g. "../collections/x/archive#") cannot aim Undo at another route.
export function ArchivedNotice({ kind, id }: ArchivedNoticeProps) {
```

and in `restore()` use
``const res = await fetch(`/api/${kind === "item" ? "items" : "collections"}/${encodeURIComponent(id)}/restore`, { method: "POST" });``.
In `src/app/collections/[id]/items/page.tsx`: import `ArchivedNotice` from `@/features/items/ArchivedNotice`
and render `<ArchivedNotice kind="item" id={searchParams.removed} />` (the page retires in Task 6). In
`ItemOverflowMenu.tsx`'s header comment replace `RemovedItemNotice` with `ArchivedNotice`. Then
`grep -rn "RemovedItemNotice\|restoreUrl" src e2e` → prints nothing.

- [ ] **Step 4:** Step 2 command → PASS; `npx tsc --noEmit` → the only errors are in
  `src/app/collections/page.tsx` (`viewerPhoto`), fixed in Task 4 — note them, do not patch here beyond deleting the `viewerPhoto={…}` prop so the build stays green.
- [ ] **Step 5:** `git add -A src/features/collections src/features/items src/lib/id.ts "src/app/collections/[id]/items/page.tsx" src/app/collections/page.tsx && git commit -m "feat(collections): owner ··· on cards (settings, members, archive, bring back); ArchivedNotice builds its own restore URL"`

## Task 4: `ActionBar`, and `/collections` becomes the searchable cover-card grid

**Files:** Create `src/components/layout/ActionBar.tsx`, `src/app/collections/page.test.tsx`. Modify
`src/components/layout/AppLayout.tsx`, `src/app/globals.css` (one rule), `src/lib/design/contrast.test.ts`
(one pair), `src/app/collections/page.tsx`. Delete `src/features/collections/CollectionFilters.tsx`.

**Interfaces:**
- Consumes: Task 1 `FilterPills`; Task 2 `collectionsViewFrom`, `collectionsViewHref`,
  `filterCollections`, `collectionsEmptyState`, `COLLECTION_PILLS`; Task 3 `CollectionCard.menu`,
  `CollectionCardMenu({ …, q })`, `ArchivedNotice({ kind, id })`, `BroughtBackNotice`, `isIdShaped`.
- Produces: `ActionBar({ label, children }: { label: string; children: React.ReactNode })` — a
  `<section aria-label={label} data-action-bar>`; pages import it from `@/components/layout/ActionBar` (not the
  barrel, so page tests can keep mocking `@/components/layout`). `AppLayout` gains
  `reserveActionBar?: boolean`.
- URL contract for `/collections`: `?status=archived`, `?q=` (≤ 100), `?removed=<collectionId>`,
  `?restored=<collectionId>`.

- [ ] **Step 1: Failing test** `src/app/collections/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Collection } from "@/types";

const { mockGetSession, collectionController, photoController, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  collectionController: { listCollections: vi.fn() },
  photoController: { findCoverPhotosByCollectionIds: vi.fn(), findCollectionIdsWithPooledPhotos: vi.fn() },
  mockRedirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "1" }) }) }));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/collections",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/server/api/collections", () => ({ CollectionController: { fromDb: () => collectionController } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photoController } }));

import CollectionsPage from "./page";

const mk = (o: Partial<Collection>): Collection => ({
  id: "col_a", ownerId: "u1", name: "Summer bags", slug: "summer-bags", description: null, status: "active",
  createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null, ...o,
});
const MINE = mk({});
const SHARED = mk({ id: "col_b", ownerId: "someone-else", name: "Mum's china", slug: "mums-china" });
const ARCHIVED = mk({ id: "col_c", name: "Old books", slug: "old-books", status: "archived" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionController.listCollections.mockResolvedValue([MINE, SHARED, ARCHIVED]);
  photoController.findCoverPhotosByCollectionIds.mockResolvedValue(new Map());
  photoController.findCollectionIdsWithPooledPhotos.mockResolvedValue(new Set());
});

const renderPage = async (searchParams?: Record<string, string | string[]>) =>
  render(await CollectionsPage({ searchParams: searchParams ? Promise.resolve(searchParams) : undefined }));

describe("/collections: cover-card grid, search, All / Archived, owner ···", () => {
  it("All shows the active collections as cards; New collection is the one primary, in the Next step bar", async () => {
    const { container } = await renderPage();
    expect(screen.getByRole("link", { name: "Summer bags" })).toHaveAttribute("href", "/collections/summer-bags");
    expect(screen.getByRole("link", { name: "Mum's china" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old books" })).not.toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Next step" });
    expect(within(bar).getByRole("link", { name: "New collection" })).toHaveAttribute("href", "/collections/new");
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    // Browser zoom shrinks the viewport below md AND short: never two fixed bands.
    expect(bar.className).toContain("[@media(max-height:500px)]:static");
  });

  it("Archived lists archived collections, with Bring back in the owner's menu", async () => {
    await renderPage({ status: "archived" });
    expect(screen.getByRole("link", { name: "Old books" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Summer bags" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "More for Old books" }).click();
    expect(await screen.findByRole("menuitem", { name: "Bring back" })).toBeInTheDocument();
  });

  it("owner cards get the ··· menu; a curator's card does not", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "More for Summer bags" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More for Mum's china" })).not.toBeInTheDocument();
  });

  it("search narrows the grid, keeps the query in the field, and the pills keep it", async () => {
    await renderPage({ q: "china" });
    expect(screen.getByRole("link", { name: "Mum's china" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Summer bags" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your collections" })).toHaveValue("china");
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/collections?status=archived&q=china");
  });

  it("a search with no match offers a quiet Clear search back to the same view", async () => {
    await renderPage({ status: "archived", q: "zzz" });
    expect(screen.getByRole("heading", { name: "Nothing matches “zzz”" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/collections?status=archived");
  });

  it("ignores a repeated q key and caps the query at 100 characters", async () => {
    await renderPage({ q: ["a", "b"] });
    expect(screen.getByRole("searchbox", { name: "Search your collections" })).toHaveValue("");
    await renderPage({ q: "x".repeat(150) });
    expect(screen.getAllByRole("searchbox", { name: "Search your collections" }).at(-1)).toHaveValue("x".repeat(100));
  });

  it("shows Undo only for the viewer's own collection that is archived now", async () => {
    const SHARED_ARCHIVED = mk({ id: "col_d", ownerId: "someone-else", name: "Their attic", status: "archived" });
    collectionController.listCollections.mockResolvedValue([MINE, SHARED, ARCHIVED, SHARED_ARCHIVED]);
    await renderPage({ removed: "col_c" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    for (const removed of [
      "col_a" /* restored already */,
      "col_zzz" /* not in their list */,
      "col_d" /* archived, but shared — not theirs to restore */,
      "../col_c/archive#" /* not id-shaped */,
    ]) {
      document.body.innerHTML = "";
      await renderPage({ removed });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("after Bring back, a focused line says where it went — only for the viewer's own, now-active collection", async () => {
    await renderPage({ status: "archived", restored: "col_a" });
    expect(screen.getByRole("status")).toHaveTextContent("Brought back. It’s under All.");
    for (const restored of ["col_c" /* still archived */, "col_b" /* shared */, "../x"]) {
      document.body.innerHTML = "";
      await renderPage({ status: "archived", restored });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("reads covers and the pool cue for the visible collections only", async () => {
    await renderPage();
    expect(photoController.findCoverPhotosByCollectionIds).toHaveBeenCalledWith(["col_a", "col_b"]);
    expect(photoController.findCollectionIdsWithPooledPhotos).toHaveBeenCalledWith(["col_a", "col_b"]);
  });

  it("gentle empty state with no button inside it (the bar carries New collection)", async () => {
    collectionController.listCollections.mockResolvedValue([ARCHIVED]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Nothing here right now" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /collection/i }).map((l) => l.textContent)).toEqual(["New collection"]);
  });
});
```

(`role="status"` is the `ArchivedNotice` container; the `mockRedirect` only fires for the
not-signed-in and first-run cases, which keep their existing tests in `src/features/onboarding`.)

`src/lib/design/contrast.test.ts` — in `pairings()`, after the `"primary border on surface"` line, add
the text guard that `quietLink`'s comment already claims (quiet links inside cards: the strip's Make
items, Clear search, See your ranking over `surface`):

```ts
    [t.primary, t.surface, 4.5, "primary link text on surface (quiet links in cards)"],
```

This is a guard, expected to pass on today's tokens; if it fails, stop and report — no token change
in PR 3.

- [ ] **Step 2:** `npx vitest run src/app/collections/page.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** `src/components/layout/ActionBar.tsx`:

```tsx
import React from "react";

interface ActionBarProps {
  /** Accessible name of the region, e.g. "Next step". */
  label: string;
  children: React.ReactNode;
}

// The page's one primary action (spec §5). From `md` up it is an inline row where
// the page places it; below `md` (phones) it is fixed to the bottom on glass-strong,
// AA from its own ≥0.85 opacity, never from what scrolls behind it. On a short
// viewport (browser zoom) it stays static — never a second fixed band. One DOM node
// for both, so the action is never duplicated. Pages that use it set AppLayout's
// reserveActionBar (9rem: the bar plus a two-line error) so the last row and the
// footer never sit behind it; data-action-bar drives the matching scroll padding
// (globals.css) so a focused bottom-row card scrolls clear of it. No safe-area
// padding: the root viewport is not viewportFit "cover", so the inset is always 0.
export function ActionBar({ label, children }: ActionBarProps) {
  return (
    <section
      aria-label={label}
      data-action-bar
      className="fixed inset-x-0 bottom-0 z-30 flex items-end gap-3 border-t border-rim bg-glass-strong px-4 py-3 shadow-lift backdrop-blur-md [&>*:first-child]:flex-1 [@media(max-height:500px)]:static md:static md:z-auto md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none md:[&>*:first-child]:flex-none"
    >
      {children}
    </section>
  );
}
```

(`items-end`: if the primary's AsyncActionButton shows its error line under the button, the pill
stays aligned to the button row's bottom edge rather than floating mid-column.)

`src/components/layout/AppLayout.tsx`: add `reserveActionBar?: boolean` to `AppLayoutProps`, destructure
it, and change the root to

```tsx
    <div className={`flex min-h-screen flex-col bg-ground ${reserveActionBar ? "pb-36 md:pb-0" : ""}`}>
```

`src/app/globals.css` — append (plain CSS; the bar is fixed only below `md` and above 500px tall):

```css
/* ActionBar is fixed on phones: keep keyboard-focused / scrolled-to content above it.
   9rem matches AppLayout's reserveActionBar (pb-36). */
@media (max-width: 767.98px) and (min-height: 501px) {
  html:has([data-action-bar]) {
    scroll-padding-bottom: 9rem;
  }
}
```

(Asserted for real in Task 7's phone e2e via `getComputedStyle(document.documentElement).scrollPaddingBottom`;
jsdom does not evaluate `:has()`.)

`src/app/collections/page.tsx` — replace the file:

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { CollectionController } from "@/server/api/collections";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { ActionBar } from "@/components/layout/ActionBar";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState, FilterPills, Input, buttonVariants } from "@/components/ui";
import { CollectionCard } from "@/features/collections/CollectionCard";
import { CollectionCardMenu } from "@/features/collections/CollectionCardMenu";
import { BroughtBackNotice } from "@/features/collections/BroughtBackNotice";
import {
  COLLECTION_PILLS,
  collectionsEmptyState,
  collectionsViewFrom,
  collectionsViewHref,
  filterCollections,
} from "@/features/collections/collectionsList";
import { ArchivedNotice } from "@/features/items/ArchivedNotice";
import { DISMISS_KEY } from "@/features/onboarding/dismissal";
import { shouldShowWelcome } from "@/features/onboarding/gate";
import { isIdShaped } from "@/lib/id";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

type Param = string | string[] | undefined;

interface CollectionsPageProps {
  searchParams?: Promise<{ status?: Param; q?: Param; removed?: Param; restored?: Param }>;
}

export default async function CollectionsPage(props: CollectionsPageProps) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access boundary: listCollections scopes to the authenticated user; every
  // downstream batch read is keyed off THESE ids, so pool state for a collection
  // the user can't see is never queried or exposed.
  const collections = await CollectionController.fromDb(db).listCollections(session.user.id);

  // First-run gate (the ONE place it lives): zero collections AND the walkthrough
  // not dismissed -> /welcome before rendering. Dismissal is a cookie the server reads.
  const dismissed = (await cookies()).get(DISMISS_KEY)?.value === "1";
  if (shouldShowWelcome(collections.length, dismissed)) {
    redirect("/welcome");
  }

  const view = collectionsViewFrom(searchParams?.status);
  // typeof: a repeated ?q= key arrives as string[] — ignore it.
  const q = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : "";
  const visible = filterCollections(collections, { view, q });
  const empty = collectionsEmptyState({ hasAny: collections.length > 0, view, q });
  const visibleIds = visible.map((c) => c.id);
  const photoController = PhotoController.fromDb(db);
  const [covers, pooled] = await Promise.all([
    photoController.findCoverPhotosByCollectionIds(visibleIds),
    photoController.findCollectionIdsWithPooledPhotos(visibleIds),
  ]);
  // The undo / brought-back lines only for one of the viewer's OWN collections in the
  // matching state right now — a stale, restored, shared, foreign or junk id renders nothing.
  const ownIn = (param: Param, archived: boolean) =>
    isIdShaped(param) &&
    collections.some((c) => c.id === param && c.ownerId === session.user.id && (c.status === "archived") === archived)
      ? param
      : null;
  const justArchived = ownIn(searchParams?.removed, true);
  const broughtBack = ownIn(searchParams?.restored, false);

  return (
    <AppLayout breadcrumbs={trail.collections()} reserveActionBar>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl text-ink sm:text-3xl">Your collections</h1>
            <p className="mt-2 text-ink-soft">The things you&rsquo;re deciding about, gathered in one calm place.</p>
          </div>
          <ActionBar label="Next step">
            <Link href="/collections/new" className={buttonVariants()}>
              New collection
            </Link>
          </ActionBar>
        </div>

        {justArchived && <ArchivedNotice kind="collection" id={justArchived} />}
        {broughtBack && <BroughtBackNotice />}

        <div className="space-y-4">
          <form role="search" action="/collections" className="flex items-end gap-2">
            {view === "archived" && <input type="hidden" name="status" value="archived" />}
            <Input
              type="search"
              name="q"
              defaultValue={q}
              label="Search your collections"
              placeholder="Name or description…"
              maxLength={100}
            />
            <Button type="submit" variant="secondary" className="h-12">
              Search
            </Button>
          </form>
          <FilterPills
            label="Filter collections"
            pills={COLLECTION_PILLS.map(([v, label]) => ({ label, href: collectionsViewHref(v, q), current: v === view }))}
          />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center">
            <EmptyState heading={empty.heading} message={empty.message} />
            {q && (
              <Link href={collectionsViewHref(view, "")} className={quietLink}>
                Clear search
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((collection) => {
              const cover = covers.get(collection.id);
              const href = `/collections/${collection.slug ?? collection.id}`;
              return (
                <li key={collection.id}>
                  <CollectionCard
                    collection={collection}
                    hasPooledPhotos={pooled.has(collection.id)}
                    coverPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined}
                    menu={
                      collection.ownerId === session.user.id ? (
                        <CollectionCardMenu
                          collectionId={collection.id}
                          name={collection.name}
                          href={href}
                          archived={collection.status === "archived"}
                          q={q}
                        />
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
```

`git rm -q src/features/collections/CollectionFilters.tsx`; `grep -rn "CollectionFilters" src` → nothing.

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run src/features/collections src/components src/lib/design/contrast.test.ts` → PASS;
  `npm run build` → PASS.
- [ ] **Step 5:** `git add -A src/components/layout src/app/globals.css src/lib/design/contrast.test.ts src/app/collections/page.tsx src/app/collections/page.test.tsx src/features/collections && git commit -m "feat(collections): searchable cover-card grid with All/Archived pills and a phone action bar"`

## Task 5: The collection home becomes the items grid

**Files:** Create `src/features/collections/CollectionHomeMenu.tsx`. Modify
`src/app/collections/[id]/page.tsx`, `src/app/collections/[id]/page.test.tsx` (rewrite),
`src/features/collections/PhotoPoolPreview.tsx`, `src/lib/items.ts` + `src/lib/items.test.ts` (one
empty-state branch), `src/features/sorting/AsyncActionButton.tsx` (`fullWidth` breakpoint),
`src/server/repositories/implementations/ItemRepository.ts` + `src/server/api/items.ts` (drop `limit`),
`src/lib/db/workspace-preview.integration.test.ts` (drop two `limit` tests). Delete
`src/features/collections/ItemPreviewGrid.tsx`, `src/features/collections/workspaceState.ts`,
`src/features/collections/workspaceState.test.ts`.

**Interfaces:**
- Consumes: Task 1 `ItemFilterPills({ path, view, q })`, `itemsViewHref`; Task 3 `ArchivedNotice({ kind, id })`,
  `isIdShaped`; Task 4 `ActionBar`, `AppLayout reserveActionBar`; PR 1 `filterItems`, `itemsEmptyState`,
  `ItemCard`, `ArchivedItemCard`, `ItemController.listArchived`; PR 2 `KeepSortingButton`.
- Produces: `CollectionHomeMenu({ href, name, isOwner })` — trigger `More for {name}`; items `Add item`
  (+ owner: `Collection settings`, `Members`). `PhotoPoolPreview({ collectionId, poolHref, photos, showLink })`
  — region named **Photos waiting**; `actionVariant` removed; with `showLink` false the thumbnail strip
  is one link to the pool named by the heading.
- Produces: `itemsEmptyState({ hasAnyItems, hasArchived?, view, q })` — `hasArchived` adds the "all
  archived" branch.
- Produces: `FindByCollectionOptions = { orderBy?: "number" }` (no `limit`).
- Home URL contract (moved from `/items`): `?status=archived`, `?unnamed=1`, `?q=` (≤ 100), `?removed=<itemId>`
  (shown only for an archived item of this collection).

> **Size note:** this is the largest task. If the subagent's context runs short, split Step 3e (the
> `limit` deletion) into its own commit/task — it is independent of the page.

- [ ] **Step 1: Failing test.** Rewrite `src/app/collections/[id]/page.test.tsx`. Keep its imports,
  `COLLECTION_ID`, `makeCollection`, `makePoolPhoto`, `makeItem`, `makeSession` and the arg-sensitive
  `mockRequireAccess` in `beforeEach`. Change the hoisted repos and mocks to:

```tsx
const { mockGetSession, mockRequireAccess, photoRepo, itemRepo, sessionRepo, prefRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  photoRepo: { findPoolByCollection: vi.fn(), findCoverPhotosByItemIds: vi.fn() },
  itemRepo: { findByCollection: vi.fn(), findArchivedByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/collections/summer-bags",
  useSearchParams: () => new URLSearchParams(),
}));
```

(the other `vi.mock` lines stay). In `beforeEach` add `itemRepo.findArchivedByCollection.mockResolvedValue([])`
(the home always reads this collection's archived items: they verify `?removed=` and drive the
"all archived" empty state).
`renderPage` takes search params:

```tsx
async function renderPage(searchParams?: Record<string, string | string[]>) {
  const ui = await CollectionPage({
    params: Promise.resolve({ id: "summer-bags" }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
  return render(ui);
}
const bar = () => screen.getByRole("region", { name: "Next step" });
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "More for Summer Bags" }));
```

(import `fireEvent` from Testing Library). Replace every `describe` block with:

```tsx
describe("the home is the items grid", () => {
  it("lists every live item as a card linking to its panel, with the tier chip once sorted", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote"), makeItem(2, "Clutch")]);
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_1", rankBucket: "top" }]);
    await renderPage();
    expect(screen.getByRole("link", { name: "Tote" })).toHaveAttribute("href", "/collections/summer-bags/items/1");
    expect(screen.getByRole("link", { name: "Clutch" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Love" })).toBeInTheDocument();
    // Every live item, in number order — the repository only sorts when asked; no preview bound.
    expect(itemRepo.findByCollection).toHaveBeenCalledWith(COLLECTION_ID, { orderBy: "number" });
    expect(screen.queryByRole("link", { name: "View all items" })).not.toBeInTheDocument();
    // TONE: the home never counts.
    expect(screen.queryByText(/\d+ items?\b/)).not.toBeInTheDocument();
  });

  it("Archived lists soft-deleted items with Bring back and no panel link", async () => {
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(3, "Old clutch")]);
    await renderPage({ status: "archived" });
    expect(screen.getByText("Old clutch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring back" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
  });

  it("search narrows the grid, keeps the query, and the pills link back to the home with it", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote"), makeItem(2, "Clutch")]);
    await renderPage({ q: "tote" });
    expect(screen.getByRole("link", { name: "Tote" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clutch" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("tote");
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/collections/summer-bags?status=archived&q=tote");
  });

  it("ignores a repeated q key, caps the query at 100, and a miss offers Clear search", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage({ q: ["a", "b"] });
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("");
    document.body.innerHTML = "";
    await renderPage({ q: "x".repeat(150) });
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("x".repeat(100));
    document.body.innerHTML = "";
    await renderPage({ unnamed: "1", q: "zzz" });
    expect(screen.getByRole("heading", { name: "Nothing matches “zzz”" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/collections/summer-bags?unnamed=1");
  });

  it("shows the undo notice only for an archived item of this collection", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(9, "Old clutch")]);
    await renderPage({ removed: "item_9" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    expect(itemRepo.findArchivedByCollection).toHaveBeenCalledWith(COLLECTION_ID); // scoped to THIS collection
    for (const removed of [
      "item_1" /* still live: a stale link */,
      "item_77" /* not an archived item of this collection */,
      "../collections/x/archive#" /* not id-shaped */,
    ]) {
      document.body.innerHTML = "";
      await renderPage({ removed });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("every item archived: the All view points at Archived instead of 'No items yet'", async () => {
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(9, "Old clutch")]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Everything here is archived" })).toBeInTheDocument();
  });
});

describe("one primary action, in the Next step bar", () => {
  it("items and no sort: Start sorting leads, Add photos is the pill beside it", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    const { container } = await renderPage();
    const start = within(bar()).getByRole("button", { name: "Start sorting" });
    expect(start.className).toContain("bg-primary");
    // The bar is fixed below md, so the primary must fill it up to md (not stop at sm).
    expect(start.className).toContain("md:w-auto");
    expect(within(bar()).getByRole("link", { name: "Add photos" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("an open sort reads Keep sorting, paused or not", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    for (const status of ["active", "paused"] as const) {
      document.body.innerHTML = "";
      sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ ...makeSession(5), status }]);
      await renderPage();
      expect(within(bar()).getByRole("button", { name: "Keep sorting" })).toBeInTheDocument();
    }
  });

  it("pool photos and no items: Make items leads; the strip shows the photos without a second link", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1"), makePoolPhoto("ph_2")]);
    const { container } = await renderPage();
    expect(within(bar()).getByRole("link", { name: "Make items" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(screen.getAllByRole("link", { name: "Make items" })).toHaveLength(1);
    const strip = screen.getByRole("region", { name: "Photos waiting" });
    // The thumbnails are one link to the pool, named by the heading (Make items text stays once).
    expect(within(strip).getByRole("link", { name: "Photos waiting" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(screen.queryByRole("button", { name: /sorting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No items yet" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("pool photos and items: the strip's quiet Make items link appears beside Start sorting", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage();
    expect(within(bar()).getByRole("button", { name: "Start sorting" })).toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Photos waiting" });
    expect(within(strip).getByRole("link", { name: "Make items" }).className).not.toContain("bg-primary");
    expect(within(strip).queryByRole("link", { name: "Photos waiting" })).not.toBeInTheDocument();
    // Decorative thumbnails: the link carries the meaning.
    expect(within(strip).queryAllByRole("img")).toHaveLength(0);
  });

  it("empty: Add photos is the only action, and the empty state has no button of its own", async () => {
    const { container } = await renderPage();
    expect(within(bar()).getByRole("link", { name: "Add photos" }).className).toContain("bg-primary");
    expect(screen.getAllByRole("link", { name: "Add photos" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "No items yet" })).toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });
});

describe("header: See your ranking and the ··· menu", () => {
  it("See your ranking appears once something is placed or a sort finished, not for a fresh open sort", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_1", rankBucket: "high" }]);
    await renderPage();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/collections/summer-bags/results");
    document.body.innerHTML = "";
    prefRepo.findByCollection.mockResolvedValue([]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();
    expect(screen.queryByRole("link", { name: "See your ranking" })).not.toBeInTheDocument();
  });

  it("the owner's menu: Add item, Collection settings, Members", async () => {
    await renderPage();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add item", "Collection settings", "Members"]);
  });

  it("a curator's menu offers Add item only", async () => {
    mockRequireAccess.mockResolvedValue(makeCollection({ ownerId: "someone-else" }));
    await renderPage();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add item"]);
  });
});

describe("access before any query", () => {
  it("an inaccessible collection renders nothing and reads nothing", async () => {
    mockRequireAccess.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(CollectionPage({ params: Promise.resolve({ id: "summer-bags" }) })).rejects.toThrow();
    expect(photoRepo.findPoolByCollection).not.toHaveBeenCalled();
    expect(itemRepo.findByCollection).not.toHaveBeenCalled();
    expect(itemRepo.findArchivedByCollection).not.toHaveBeenCalled();
    expect(sessionRepo.findByCollectionAndCurator).not.toHaveBeenCalled();
  });

  it("hrefs use the slug, never a raw ULID, and sessions are this curator's own", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.every((h) => !h.includes(COLLECTION_ID) && !h.includes("sess_zzz"))).toBe(true);
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith(COLLECTION_ID, "u1");
  });
});
```

`src/lib/items.test.ts` — in the `itemsEmptyState` describe, add:

```ts
  it("everything archived points at Archived, not 'No items yet'", () => {
    expect(itemsEmptyState({ hasAnyItems: false, hasArchived: true, view: "all", q: "" })).toEqual({
      heading: "Everything here is archived",
      message: "Find it under Archived.",
    });
    expect(itemsEmptyState({ hasAnyItems: false, hasArchived: false, view: "all", q: "" }).heading).toBe("No items yet");
  });
```

- [ ] **Step 2:** `npx vitest run "src/app/collections/[id]/page.test.tsx" src/lib/items.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

**3a.** `src/lib/items.ts` — `itemsEmptyState` takes `hasArchived?: boolean`; replace the
`if (!opts.hasAnyItems) …` line with:

```ts
  if (!opts.hasAnyItems) {
    return opts.hasArchived
      ? { heading: "Everything here is archived", message: "Find it under Archived." }
      : { heading: "No items yet", message: "Add photos to start your collection." };
  }
```

**3b.** `src/features/sorting/AsyncActionButton.tsx` — `fullWidth` stretches up to `md`, not `sm` (its
only caller is the home's KeepSortingButton, inside the ActionBar that is fixed below `md`): in both
places change `w-full sm:w-auto` → `w-full md:w-auto`, and the prop doc to "Full width below `md`
(the phone action bar), natural width above."

**3c.** `src/features/collections/CollectionHomeMenu.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { OverflowMenu, type OverflowMenuItem } from "@/components/ui";

// The home's rarer actions (PRODUCT "Familiar first"): every member can add an
// item by hand; settings and members are the owner's (each page is server-gated too).
export function CollectionHomeMenu({ href, name, isOwner }: { href: string; name: string; isOwner: boolean }) {
  const router = useRouter();
  const items: OverflowMenuItem[] = [
    { label: "Add item", onSelect: () => router.push(`${href}/items/new`) },
    ...(isOwner
      ? [
          { label: "Collection settings", onSelect: () => router.push(`${href}/edit`) },
          { label: "Members", onSelect: () => router.push(`${href}/members`) },
        ]
      : []),
  ];
  return <OverflowMenu label={`More for ${name}`} items={items} />;
}
```

**3d.** `src/features/collections/PhotoPoolPreview.tsx` — props become
`{ collectionId: string; poolHref: string; photos: { id: string }[]; showLink: boolean }` (drop
`actionVariant`, its doc comment and the `buttonVariants` import). Heading text and the labelled
section:

```tsx
    <section aria-labelledby="photo-pool-heading">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 id="photo-pool-heading" className="text-xl text-ink">
            Photos waiting
          </h2>
          <p className="mt-1 text-sm text-ink-soft">These can become items whenever you&rsquo;re ready.</p>
        </div>
        {showLink ? (
          thumbnails
        ) : (
          // Photos-only: the bar's primary already reads "Make items", so the strip is one
          // link to the pool named by the heading — the visible name stays on screen once.
          <Link href={poolHref} aria-labelledby="photo-pool-heading" className="block rounded-control focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary">
            {thumbnails}
          </Link>
        )}
        {showLink && (
          <Link href={poolHref} className={quietLink}>
            Make items
          </Link>
        )}
      </Card>
    </section>
```

where `const thumbnails = (/* the existing thumbnail <ul>, unchanged */);` is hoisted above the return.

Update the component comment: "Read-only strip of loose pool photos above the home grid. Its Make
items link shows only when sorting holds the page's primary action; otherwise the bar's primary is
Make items itself (one name on screen once) and the thumbnails are a single link to the pool."

**3e. Drop the unused `limit` path** (the home was its only caller). In
`src/server/repositories/implementations/ItemRepository.ts`: `FindByCollectionOptions` becomes
`{ orderBy?: "number" }`; `findByCollection` returns `(await ordered).map(…)` with no `.limit`; rewrite
the two comments (above the interface and above the method) to describe `orderBy` only. In
`src/server/api/items.ts` replace the stale comment on `listItems` with "`options.orderBy: "number"`
for a stable grid order; omit it for an unordered read." In
`src/lib/db/workspace-preview.integration.test.ts` delete the tests "returns only the preview slice in
number ASC order" and "resolves covers only for the displayed item ids via findCoverPhotosByItemIds";
in "breaks number ties by id ascending…" drop `limit: 12,` from the options (the `orderBy` tie-break
stays a DB test — it is SQL ordering semantics). `grep -rn "limit: 12" src` → nothing; `grep -rn "FindByCollectionOptions" src` → the repository and `items.ts` only.

**3f.** `src/app/collections/[id]/page.tsx` — replace the file:

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { ActionBar } from "@/components/layout/ActionBar";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState, Input, buttonVariants } from "@/components/ui";
import { KeepSortingButton } from "@/features/sessions/KeepSortingButton";
import { PhotoPoolPreview } from "@/features/collections/PhotoPoolPreview";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { CollectionHomeMenu } from "@/features/collections/CollectionHomeMenu";
import { ItemCard } from "@/features/items/ItemCard";
import { ArchivedItemCard } from "@/features/items/ArchivedItemCard";
import { ArchivedNotice } from "@/features/items/ArchivedNotice";
import { ItemFilterPills, itemsViewHref, type ItemsView } from "@/features/items/ItemFilterPills";
import { filterItems, itemsEmptyState } from "@/lib/items";
import { isIdShaped } from "@/lib/id";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

type Param = string | string[] | undefined;

interface CollectionPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: Param; unnamed?: Param; removed?: Param; q?: Param }>;
}

export default async function CollectionPage({ params, searchParams: searchParamsPromise }: CollectionPageProps) {
  const { id } = await params;
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access is enforced BEFORE any read — a thrown redirect here means nothing below runs.
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const view: ItemsView =
    searchParams?.status === "archived" ? "archived" : searchParams?.unnamed === "1" ? "unnamed" : "all";
  // typeof: a repeated ?q= key arrives as string[] — ignore it.
  const q = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : "";
  const itemController = ItemController.fromDb(db);
  // One round-trip. A failed read PROPAGATES (never caught into [] and shown as empty).
  // Archived items are always read (this collection's only): they verify ?removed= and
  // tell "nothing yet" from "everything archived".
  const [pool, liveItems, archivedItems, sessions, preferences] = await Promise.all([
    PhotoController.fromDb(db).findPoolByCollection(collection.id, 6),
    itemController.listItems(collection.id, { orderBy: "number" }),
    itemController.listArchived(collection.id),
    SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
  ]);
  const items = view === "archived" ? archivedItems : liveItems;
  const visible = filterItems(items, { unnamed: view === "unnamed", q });
  const covers =
    visible.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(visible.map((i) => i.id))
      : new Map();
  const coverUrl = (itemId: string) => {
    const c = covers.get(itemId);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
  const tierByItem = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));

  const base = `/collections/${collection.slug ?? collection.id}`;
  const poolHref = `${base}/pool`;
  // purses-t9l: each user sorts independently. A paused sort is still the current one.
  const currentSession = sessions.find((s) => s.status === "active" || s.status === "paused");
  // Something to see on the Ranking: a placed piece, or a sort finished before.
  const hasEverSorted = preferences.length > 0 || sessions.some((s) => s.status === "completed");
  const canSort = liveItems.length > 0 || currentSession !== undefined;
  const showPool = pool.length > 0 && view === "all" && !q;
  // The archive undo (purses-v7gv): only for an id-shaped value that IS an archived item
  // of THIS collection — a stale, foreign or hostile ?removed= renders nothing.
  const removed = searchParams?.removed;
  const justArchived =
    view !== "archived" && isIdShaped(removed) && archivedItems.some((i) => i.id === removed) ? removed : null;
  const empty = itemsEmptyState({ hasAnyItems: items.length > 0, hasArchived: archivedItems.length > 0, view, q });
  const poolOnly = showPool && liveItems.length === 0;

  return (
    <AppLayout breadcrumbs={trail.collection(collection)} reserveActionBar>
      {/* Tighter on phone so a card row shows above the fold at 390×664. */}
      <div className="space-y-4 md:space-y-8">
        {/* The header group: title, ···, and the chip row held together; the action row breaks after it. */}
        <div className="space-y-2">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-2xl text-ink sm:text-3xl">{collection.name}</h1>
              {collection.description && <p className="mt-2 text-ink-soft">{collection.description}</p>}
            </div>
            <CollectionHomeMenu href={base} name={collection.name} isOwner={collection.ownerId === session.user.id} />
          </header>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <WorkspaceModeChips base={base} activeMode="build" />
            {hasEverSorted && (
              <Link href={`${base}/results`} className={quietLink}>
                See your ranking
              </Link>
            )}
          </div>
        </div>

        {/* Spec §5: the one primary action, Add photos beside it. Start sorting needs
            something to sort; before that the primary is the way to items. */}
        <ActionBar label="Next step">
          {canSort ? (
            <KeepSortingButton
              fullWidth
              collectionId={collection.id}
              curatorId={session.user.id}
              sortHref={`${base}/sort`}
              session={
                currentSession
                  ? { id: currentSession.id, status: currentSession.status as "active" | "paused" }
                  : null
              }
            />
          ) : (
            <Link href={poolHref} className={buttonVariants()}>
              {pool.length > 0 ? "Make items" : "Add photos"}
            </Link>
          )}
          {canSort && (
            <Link href={poolHref} className={buttonVariants({ variant: "secondary" })}>
              Add photos
            </Link>
          )}
        </ActionBar>

        {justArchived && <ArchivedNotice kind="item" id={justArchived} />}

        {showPool && (
          <PhotoPoolPreview
            collectionId={collection.id}
            poolHref={poolHref}
            photos={pool.map((p) => ({ id: p.id }))}
            showLink={canSort}
          />
        )}

        <div className="space-y-4">
          <form role="search" action={base} className="flex items-end gap-2">
            {view === "archived" && <input type="hidden" name="status" value="archived" />}
            {view === "unnamed" && <input type="hidden" name="unnamed" value="1" />}
            <div className="w-full">
              {/* Visually hidden below md (above-the-fold room); the accessible name stays. */}
              <label htmlFor="home-search" className="mb-2 block text-sm font-medium text-ink max-md:sr-only">
                Search your items
              </label>
              <Input id="home-search" type="search" name="q" defaultValue={q} placeholder="Name, brand, color…" maxLength={100} />
            </div>
            <Button type="submit" variant="secondary" className="h-12">
              Search
            </Button>
          </form>
          <ItemFilterPills path={base} view={view} q={q} />
        </div>

        {visible.length > 0 ? (
          <ul aria-label="Your items" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <li key={item.id}>
                {view === "archived" ? (
                  <ArchivedItemCard item={item} coverUrl={coverUrl(item.id)} />
                ) : (
                  <ItemCard
                    item={item}
                    collectionId={collection.slug ?? collection.id}
                    heroPhotoUrl={coverUrl(item.id)}
                    bucket={tierByItem.get(item.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          !poolOnly && (
            <div className="flex flex-col items-center">
              <EmptyState heading={empty.heading} message={empty.message} />
              {q && (
                <Link href={itemsViewHref(base, view, "")} className={quietLink}>
                  Clear search
                </Link>
              )}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
```

Then:

```bash
git rm -q src/features/collections/ItemPreviewGrid.tsx src/features/collections/workspaceState.ts src/features/collections/workspaceState.test.ts
grep -rnE "ItemPreviewGrid|workspaceState|resolveWorkspaceState|actionVariant" src
```

→ the grep prints nothing.

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run src/features/collections src/features/sessions src/features/sorting src/app/collections src/lib/items.test.ts src/server` → PASS;
  `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/workspace-preview.integration.test.ts` → PASS;
  `npm run build` → PASS.
- [ ] **Step 5:** `git add -A src/features/collections src/features/sorting/AsyncActionButton.tsx src/lib/items.ts src/lib/items.test.ts src/server/repositories/implementations/ItemRepository.ts src/server/api/items.ts src/lib/db/workspace-preview.integration.test.ts "src/app/collections/[id]/page.tsx" "src/app/collections/[id]/page.test.tsx" && git commit -m "feat(home): the collection home is the items grid — Start sorting with Add photos beside it"`

## Task 6: Retire the items list; every link points home; enumeration test

**Files:** Replace `src/app/collections/[id]/items/page.tsx` and rewrite its
`src/app/collections/[id]/items/page.test.tsx` as the redirect's unit test. Modify `src/lib/collections/retired-redirect.ts`;
`src/app/collections/[id]/items/[itemNumber]/page.tsx` (not-found redirect, `ItemOverflowMenu` prop),
`…/[itemNumber]/edit/page.tsx`, `…/[itemNumber]/photos/page.tsx`; `src/features/items/ItemOverflowMenu.tsx`
+ test; `src/features/pool/PoolPhotoGrid.tsx` + test; `src/app/collections/[id]/results/page.tsx:80`;
`src/components/layout/breadcrumb-trails.ts` + test; `src/lib/db/page-authz-enumeration.integration.test.ts`.

**Interfaces:**
- Produces: `redirectRetired(id: string, to: "" | "sort" | "results", query?: URLSearchParams): Promise<never>`
  (`""` = the collection home); existing `"sort"`/`"results"` callers are unchanged.
- Produces: `ItemOverflowMenu({ itemId, listHref, isOwner })` — `itemsHref` renamed `listHref` (the home).
- `trail.items` and `itemsPrefix` are removed; `trail.item` / `trail.itemNew` hang off the collection.

- [ ] **Step 1: Failing tests.** In `page-authz-enumeration.integration.test.ts`, in the
  "edit/photos redirect a member…" test replace the `items` constant and the two non-numeric
  expectations with:

```ts
      const home = `/collections/slug-${collectionId}`;
      // …
        expect(await outcome("edit", "1")).toBe(`NEXT_PERMANENT_REDIRECT:${home}/items/1`);
        expect(await outcome("photos", "1")).toBe(`NEXT_PERMANENT_REDIRECT:${home}/items/1`);
        expect(await outcome("edit", "../x")).toBe(`NEXT_PERMANENT_REDIRECT:${home}`);
        expect(await outcome("photos", "1?x")).toBe(`NEXT_PERMANENT_REDIRECT:${home}`);
```

(rename the test "…; a non-numeric number goes home"), and add after the retired-sort test:

```ts
    it("the retired items list sends a member home through the guard, with its allow-listed params", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const home = `/collections/slug-${collectionId}`;
      const mod = (await import("@/app/collections/[id]/items/page")) as {
        default: (p: {
          params: Promise<{ id: string }>;
          searchParams?: Promise<Record<string, string | string[]>>;
        }) => Promise<unknown>;
      };
      try {
        // ONE un-mocked crossing (real DB, real guard, real slug resolution); the
        // allow-list permutations are unit-tested in items/page.test.tsx.
        const out = await mod
          .default({
            params: Promise.resolve({ id: collectionId }),
            searchParams: Promise.resolve({ status: "archived", q: "tote", removed: "itm_1", utm: "x" }),
          })
          .catch((e: Error) => e.message);
        expect(out).toBe(`NEXT_PERMANENT_REDIRECT:${home}?status=archived&q=tote&removed=itm_1`);
      } finally {
        mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      }
    });
```

(The stranger case `p("collections/[id]/items", { id })` stays: the guard still bounces them first.)

Rewrite `src/app/collections/[id]/items/page.test.tsx` (runs in `test:ci`):

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectRetired } = vi.hoisted(() => ({ redirectRetired: vi.fn() }));
vi.mock("@/lib/collections/retired-redirect", () => ({ redirectRetired }));

import ItemsListRedirect from "./page";

beforeEach(() => vi.clearAllMocks());

const go = async (sp?: Record<string, string | string[]>) => {
  await ItemsListRedirect({ params: Promise.resolve({ id: "bags" }), searchParams: sp && Promise.resolve(sp) });
  const [id, to, query] = redirectRetired.mock.lastCall as [string, string, URLSearchParams];
  return [id, to, query.toString()];
};

describe("retired items list → the collection home", () => {
  it("carries only the allow-listed view, query and an id-shaped notice", async () => {
    expect(await go()).toEqual(["bags", "", ""]);
    expect(await go({ status: "archived", q: "tote", removed: "itm_1", utm: "x" })).toEqual([
      "bags", "", "status=archived&q=tote&removed=itm_1",
    ]);
    expect(await go({ q: ["a", "b"], unnamed: "1", status: "nope" })).toEqual(["bags", "", "unnamed=1"]);
    expect(await go({ q: "y".repeat(150) })).toEqual(["bags", "", `q=${"y".repeat(100)}`]);
    expect(await go({ removed: "../collections/c/archive#", unnamed: ["1", "1"], q: "  " })).toEqual(["bags", "", ""]);
  });
});
```

`src/components/layout/breadcrumb-trails.test.ts`: delete the `items: trail.items(c),` line; replace
the slug-fallback test body with `expect(trail.item(noSlug, item).at(-2)?.href).toBe("/collections/col-2");`
and add:

```ts
  it("an item hangs off the collection home (no Items level since PR 3)", () => {
    expect(trail.item(c, item).map((x) => x.label)).toEqual(["Collections", "Spring Bags", "Red Clutch"]);
    expect(trail.itemNew(c).at(-2)).toEqual({ label: "Spring Bags", href: "/collections/spring-bags" });
  });
```

`src/features/items/ItemOverflowMenu.test.tsx`: `const props = { itemId: "i1", listHref: "/collections/bags" };`
and the two `push` expectations become `"/collections/bags?removed=i1"` and `"/collections/bags"`.
`src/features/pool/PoolPhotoGrid.test.tsx:117`: expect `"/collections/c1"`.

- [ ] **Step 2:** `npx vitest run "src/app/collections/[id]/items/page.test.tsx" src/components/layout/breadcrumb-trails.test.ts src/features/items/ItemOverflowMenu.test.tsx src/features/pool/PoolPhotoGrid.test.tsx` → FAIL;
  `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/page-authz-enumeration.integration.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `src/lib/collections/retired-redirect.ts`:

```ts
/**
 * Retired collection pages (spec §4, §5) bounce old links here. The access guard runs
 * FIRST — page-authz-enumeration expects the stranger's redirect to be the first
 * throw — then a permanent (308) move to the home (""), the Sort screen or the Ranking.
 */
export async function redirectRetired(
  id: string,
  to: "" | "sort" | "results",
  query?: URLSearchParams,
): Promise<never> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  const path = `/collections/${collection.slug ?? collection.id}${to ? `/${to}` : ""}`;
  const qs = query?.toString();
  permanentRedirect(qs ? `${path}?${qs}` : path);
}
```

`src/app/collections/[id]/items/page.tsx` — replace the file:

```tsx
import { redirectRetired } from "@/lib/collections/retired-redirect";
import { isIdShaped } from "@/lib/id";

type Param = string | string[] | undefined;

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, Param>>;
}

// The collection home is the items grid now (spec §5). Old links keep their view,
// query and undo notice; anything else is dropped. Only allow-listed values are
// copied (removed only when id-shaped), never interpolated raw. The guard runs
// first, inside redirectRetired.
export default async function ItemsListRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const keep = new URLSearchParams();
  if (sp.status === "archived") keep.set("status", "archived");
  if (sp.unnamed === "1") keep.set("unnamed", "1");
  if (typeof sp.q === "string" && sp.q.trim()) keep.set("q", sp.q.slice(0, 100));
  if (isIdShaped(sp.removed)) keep.set("removed", sp.removed);
  return redirectRetired(id, "", keep);
}
```

`…/[itemNumber]/edit/page.tsx` and `…/photos/page.tsx`: replace
`const items = \`/collections/${collection.slug ?? collection.id}/items\`;` and the redirect line with

```tsx
  const home = `/collections/${collection.slug ?? collection.id}`;
  permanentRedirect(/^\d+$/.test(itemNumber) ? `${home}/items/${itemNumber}` : home);
```

`…/[itemNumber]/page.tsx`: the not-found line becomes `redirect(\`/collections/${collection.slug ?? collection.id}\`);`
and the menu prop becomes `listHref={\`/collections/${collection.slug ?? collection.id}\`}`.
`ItemOverflowMenu.tsx`: rename the prop `itemsHref` → `listHref` (doc: "The collection home — its items
grid; archive lands here with ?removed=<id>.") in the interface, the destructure and both `router.push` calls.
`PoolPhotoGrid.tsx:102`: `href: \`/collections/${collectionId}\``.
`results/page.tsx:80`: `const hrefOf = (item: Item) => (item.number === null ? base : \`${base}/items/${item.number}\`);`

`breadcrumb-trails.ts`: delete `itemsPrefix` and the `items:` builder; change

```ts
  itemNew: (c: TrailCollection): Crumb[] => [...collectionPrefix(c), { label: "Add item" }],
  item: (c: TrailCollection, item: TrailItem): Crumb[] => [
    ...collectionPrefix(c),
    { label: itemDisplayName(item) },
  ],
```

Then `grep -rnE "trail\.items|itemsHref|/items\`\)|/items\"" src` → only API paths (`/api/…/items`) and
`items/new` / `items/${n}` links remain.

- [ ] **Step 4:** Step 2 commands → PASS; `npm run build` → PASS.
- [ ] **Step 5:** `git add -A src && git commit -m "feat(items): retire the items list — 308 home with view and query; links and crumbs follow"`

## Task 7: Lists-and-home e2e (tablet + phone bar in CI), neighbours, CI map, screenshot surfaces

**Files:** Create `e2e/lists-and-home.spec.ts`. Modify `e2e/fixtures/seed.ts` (one helper),
`e2e/item-panel.spec.ts:121`, `e2e/a11y.spec.ts:107-118`, `e2e/image-perf.spec.ts:20-27`,
`e2e/screenshots/capture.ts`, `.github/workflows/ci.yml` (only the spec names on the
`A_COLLECTION`/`A_ITEMS` selection lines ~449-457; **no filter paths added**). Delete `e2e/adaptive-collection-workspace.spec.ts`.

**Interfaces:** Consumes the accessible names from Tasks 3-6: region `Next step`; links `New
collection`, `Add photos`, `Make items`, `All`, `Archived`, `See your ranking`; buttons `Start
sorting`, `Keep sorting`, `More for {name}`, `Search`, `Undo`; menuitems `Archive`, `Bring back`;
searchboxes `Search your collections`, `Search your items`; region `Photos waiting`; list `Your items`
(the home grid); text
`/^Archived\./`, `Nothing matches “…”`. Produces
`seedNamedCollection(ownerId, name, status?) → { collectionId, slug }`.

Coverage map for the deletion: the four adaptive-state tests → this spec's home tests (states are now
the bar's three primaries); the wayfinding back-arrow and phone-collapse tests → copied verbatim (the
tablet-only back-arrow test gains the project skip); the keyboard-order test → rewritten for the new
order, on its own collection.

- [ ] **Step 1: Seed helper.** Append to `e2e/fixtures/seed.ts`:

```ts
/** A uniquely named, slugged collection — for specs that act on one card in the shared list. */
export async function seedNamedCollection(
  ownerId: string,
  name: string,
  status: "active" | "archived" = "active",
): Promise<SeededCollectionRef> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = `e2e-named-${collectionId}`;
  await db.insert(collectionsTable).values({ id: collectionId, ownerId, name, slug, status });
  return { collectionId, slug };
}
```

- [ ] **Step 2: The spec** `e2e/lists-and-home.spec.ts`:

```ts
// Lists and home (spec 2026-10-01 §5), un-mocked except photo bytes: the collections
// grid (search, owner ···, Archive with Undo, Archived, Bring back), the collection home
// as the items grid (one primary + Add photos, search, pills), the phone action bar's
// geometry (viewport-sensitive, checked here in CI at iPhone width), and wayfinding.
import { test, expect, type Page } from "@playwright/test";
import { closeDb } from "./fixtures/db";
import {
  seedBaseline,
  seedJourneyScenario,
  seedNamedCollection,
  seedWorkspaceStates,
  type SeededCollectionRef,
} from "./fixtures/seed";

const FIXTURE = "e2e/fixtures/sample-images/labeled/sort-images.webp";
const PHONE = { width: 390, height: 664 };

let ownerId: string;
let poolOnly: SeededCollectionRef;
let itemsOnly: SeededCollectionRef;
let startable: SeededCollectionRef;
let empty: SeededCollectionRef;
let shelf: { name: string } & SeededCollectionRef;
let long: { slug: string };

test.beforeAll(async () => {
  ownerId = await seedBaseline();
  ({ poolOnly, itemsOnly, empty } = await seedWorkspaceStates(ownerId));
  // A second items-only collection, used ONLY by the test that clicks Start sorting
  // (it opens a session, so "Start sorting" never comes back there). Keeps the
  // keyboard-order test on itemsOnly independent of test order and retries.
  ({ itemsOnly: startable } = await seedWorkspaceStates(ownerId));
  const name = `E2E Shelf ${Date.now()}`;
  shelf = { name, ...(await seedNamedCollection(ownerId, name)) };
  long = await seedJourneyScenario(ownerId, 8); // enough cards to scroll on a phone
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ page }) => {
  for (const pattern of ["**/api/photo-files/**", "**/pool/photos/**/file*"]) {
    await page.route(pattern, (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  }
});

const card = (page: Page, name: string) => page.getByRole("link", { name, exact: true });

test("collections: search, archive with Undo, Archived, Bring back", async ({ page }) => {
  await page.goto("/collections");
  await expect(page).toHaveURL((u) => u.pathname === "/collections");
  await expect(page.getByRole("region", { name: "Next step" }).getByRole("link", { name: "New collection" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search your collections" }).fill(shelf.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("q") === shelf.name);
  await expect(card(page, shelf.name)).toBeVisible();
  await expect(card(page, "E2E Workspace items-only")).toHaveCount(0);

  // Archive → the list with the Undo notice → Undo brings it straight back.
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForURL((u) => u.searchParams.get("removed") === shelf.collectionId);
  await expect(page.getByText(/^Archived\./)).toBeVisible();
  await expect(card(page, shelf.name)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForURL((u) => !u.searchParams.has("removed"));
  await expect(card(page, shelf.name)).toBeVisible();

  // Archive again, find it under Archived, Bring back from its ···.
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForURL((u) => u.searchParams.has("removed"));
  await page.getByRole("link", { name: "Archived", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("status") === "archived");
  await page.getByRole("button", { name: `More for ${shelf.name}` }).click();
  await page.getByRole("menuitem", { name: "Bring back" }).click();
  await expect(card(page, shelf.name)).toHaveCount(0); // (other runs' archived shelves may remain)
  await page.getByRole("link", { name: "All", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search your collections" }).fill(shelf.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(card(page, shelf.name)).toBeVisible();
  await card(page, shelf.name).click();
  await expect(page).toHaveURL((u) => u.pathname === `/collections/${shelf.slug}`);
});

test("home: the items grid with Start sorting and Add photos beside it", async ({ page }) => {
  const home = `/collections/${startable.slug}`; // this test opens a sort; nothing else uses it
  await page.goto(home);
  await expect(page).toHaveURL((u) => u.pathname === home);
  await expect(card(page, "E2E Workspace Tote")).toHaveAttribute("href", `${home}/items/1`);

  const bar = page.getByRole("region", { name: "Next step" });
  await expect(bar.getByRole("link", { name: "Add photos" })).toHaveAttribute("href", `${home}/pool`);

  await page.getByRole("searchbox", { name: "Search your items" }).fill("zzz-nothing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing matches “zzz-nothing”" })).toBeVisible();
  await page.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === home && u.searchParams.get("status") === "archived");

  await page.goto(home);
  await bar.getByRole("button", { name: "Start sorting" }).click();
  await page.waitForURL((u) => u.pathname === `${home}/sort`);
});

test("home before items: Make items leads when photos wait", async ({ page }) => {
  // (The empty state's Add photos is pinned by the page unit test; no second e2e for it.)
  await page.goto(`/collections/${poolOnly.slug}`);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(page.getByRole("region", { name: "Photos waiting" })).toBeVisible();
  await bar.getByRole("link", { name: "Make items" }).click();
  await page.waitForURL((u) => u.pathname === `/collections/${poolOnly.slug}/pool`);
});

test("phone: the bar is pinned to the bottom and never hides the last row", async ({ page }) => {
  // Viewport-sensitive (spec §5), so it runs in CI's tablet project at iPhone 13 width.
  await page.setViewportSize(PHONE);
  const home = `/collections/${long.slug}`;
  await page.goto(home);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(bar.getByRole("button", { name: "Keep sorting" })).toBeVisible();
  const pinned = async () => {
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(PHONE.height);
    return box;
  };
  const topBar = await pinned();
  const cards = page.getByRole("list", { name: "Your items" }).getByRole("listitem");

  // Above the fold: a card row is visible on load, clear of the bar (no scroll).
  const firstOnLoad = (await cards.first().boundingBox())!;
  expect(firstOnLoad.y + firstOnLoad.height / 2).toBeLessThan(topBar.y);
  // Keyboard focus scrolls a bottom-row card clear of the bar: the scroll padding matches the reserve.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe("144px");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barBox = await pinned();
  const lastCard = (await cards.last().boundingBox())!;
  expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(barBox.y);
  const footer = (await page.getByText("Find the things you love").boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(barBox.y);

  // The same node is an inline row above the grid on tablet.
  await page.setViewportSize({ width: 1080, height: 810 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const inline = (await bar.boundingBox())!;
  const firstCard = (await cards.first().boundingBox())!;
  expect(inline.y + inline.height).toBeLessThan(firstCard.y);
});

// The accessible names of every keyboard-focusable element, in DOM order (= Tab order:
// no positive tabindex anywhere). WebKit's Tab skips links, so DOM order is asserted.
async function focusableNamesInDomOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        if ((el as HTMLElement).tabIndex < 0) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
      .filter((name) => name.length > 0);
  });
}

test("keyboard order on the home: trail → menu → chips → primary → pill → search → cards", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet", "DOM order is viewport-independent; the phone trail collapses");
  await page.goto(`/collections/${itemsOnly.slug}`); // never sorted: no other test opens a sort here
  await expect(card(page, "E2E Workspace Tote")).toBeVisible();
  const order = await focusableNamesInDomOrder(page);
  const seen = JSON.stringify(order);
  const idx = (label: string) => order.indexOf(label);
  expect(idx("Collections"), seen).toBeGreaterThanOrEqual(0);
  expect(idx("More for E2E Workspace items-only"), seen).toBeGreaterThan(idx("Collections"));
  expect(idx("Decide"), seen).toBeGreaterThan(idx("More for E2E Workspace items-only"));
  expect(idx("Start sorting"), seen).toBeGreaterThan(idx("Decide"));
  expect(idx("Add photos"), seen).toBeGreaterThan(idx("Start sorting"));
  expect(idx("Search"), seen).toBeGreaterThan(idx("Add photos"));
  expect(idx("E2E Workspace Tote"), seen).toBeGreaterThan(idx("Search"));
});
```

Then copy the two wayfinding tests ("back arrow on a deep page: the tablet pointer shortcut lands on
the parent route" and "phone: the trail collapses to a single accessible back link") **verbatim** from
`e2e/adaptive-collection-workspace.spec.ts` to the end of this file — except that the back-arrow test
takes `({ page }, testInfo)` and opens with
`test.skip(testInfo.project.name !== "tablet", "the pointer-only arrow is a tablet affordance");`
(precedent `e2e/a11y.spec.ts:94`), so the mandated `PW_VIEWPORT=phone` run passes by design — and
`git rm -q e2e/adaptive-collection-workspace.spec.ts`.

- [ ] **Step 3: Run, expect PASS** (Tasks 3-6 built the surfaces):
  `npx playwright test e2e/lists-and-home.spec.ts --project=tablet`. If a selector misses, fix the
  selector against the names above — never loosen an assertion.

- [ ] **Step 4: Neighbours.**
  `e2e/item-panel.spec.ts:121` → `await page.waitForURL((u) => u.pathname === \`/collections/${slug}\` && u.searchParams.has("removed"));`
  `e2e/image-perf.spec.ts`: the first test is renamed "the home grid requests the resized card width
  (w=640)" and goes to `/collections/${slug}`.
  `e2e/a11y.spec.ts`: replace the `items` and `items-archived` screens with
  `["home-archived", \`/collections/${slug}?status=archived\`]` and add
  `["collections-archived", "/collections?status=archived"]` (count stays 10; the comment is unchanged).
  `e2e/screenshots/capture.ts`: replace the surfaces `items-grid`, `workspace-pool-first`,
  `workspace-items-first`, `items`, `items-archived` with

```ts
      // UX redesign PR 3: the collections grid's Archived view, the home as the
      // items grid (items, pool-first, archived) — phone shots show the bottom bar.
      ["collections-archived", "/collections?status=archived"],
      ["home", `/collections/${slug}`],
      ["home-pool-first", `/collections/${workspacePoolFirstSlug}`],
      ["home-items-first", `/collections/${workspaceItemsFirstSlug}`],
      ["home-archived", `/collections/${archivedSlug}?status=archived`],
```

  and in `beforeAll` (beside the other seeds) add one archived collection so that shot is not empty:
  `await seedNamedCollection(ownerId, "E2E Archived shelf", "archived");` (import it).
  `npx tsc --noEmit -p tsconfig.json` stays clean for `e2e/`.

- [ ] **Step 5: CI map.** Add **no** filter paths (Global Constraints: a `src/components/layout/**`
  change matches no area and so runs the full suite — keep it that way; `src/lib/collections/**` is
  outside the `ui` filter). Only change the two selection lines to

```bash
          if [ "$A_COLLECTION" = "true" ]; then
            add "e2e/lists-and-home.spec.ts e2e/delete-collection.spec.ts"
          fi
```

```bash
          if [ "$A_ITEMS" = "true" ]; then
            add "e2e/item-panel.spec.ts e2e/item-removal.spec.ts e2e/image-perf.spec.ts e2e/lists-and-home.spec.ts"
          fi
```

  `npx vitest run scripts/ci-e2e-map.test.ts` → PASS (every spec on disk listed; every listed spec exists).

- [ ] **Step 6: Run.** `npx playwright test e2e/lists-and-home.spec.ts e2e/item-panel.spec.ts e2e/image-perf.spec.ts e2e/a11y.spec.ts e2e/layout.spec.ts e2e/smoke.spec.ts e2e/delete-collection.spec.ts --project=tablet`
  → PASS with local retries at 0 (the default) — an order-dependent test fails here instead of
  hiding behind CI's retries. (Do not use `--repeat-each`: the Start-sorting test intentionally
  consumes its own `startable` collection once per `beforeAll`.) Local gate (not CI):
  `PW_VIEWPORT=phone npx playwright test e2e/lists-and-home.spec.ts e2e/layout.spec.ts e2e/item-panel.spec.ts`
  → PASS (the tablet-only tests report as skipped).
- [ ] **Step 7:** `git add -A e2e .github/workflows/ci.yml && git commit -m "test(e2e): lists-and-home journey with the phone bar; CI map and screenshot surfaces follow"`

## Task 8: Docs, full gate, graphify, screenshots

**Files:** Modify `DESIGN.md` §5 (Components), `docs/ARCHITECTURE.md` (decision 23's status line;
append decision 43). `docs/API.md` is untouched (no route or contract changed — the archive/restore
routes already documented).

- [ ] **Step 1: DESIGN.md §5.** Add after **Glass panel**:

```markdown
- **Action bar:** the page's one primary action (`ActionBar`, `src/components/layout/ActionBar.tsx`).
  From `md` up an inline row where the page places it; on phone a fixed bottom bar on `glass-strong`
  + backdrop blur + a `rim` top edge; static on a short viewport (browser zoom), never a second fixed
  band. The page reserves 9rem (`AppLayout reserveActionBar`: the bar plus a two-line error) and sets
  a matching `scroll-padding-bottom`, so the last row, the footer and a keyboard-focused card never
  sit behind it. The primary fills the bar below `md`. It holds the primary and at most one pill
  beside it (the home's **Add photos**). One per screen; with the header it is the second of the three
  glass-strong surfaces a screen may carry.
```

  In **Cards** append: "Collection cards carry the owner's `···` (top-right, the `compact` trigger over
  the cover, above the stretched link) and no status badge — the Archived pill says it; item cards carry
  none — their rarer actions live on the item panel." In **Wayfinding**
  replace "Mode chips appear on section **index** pages only (Photos, Items, Sort, Decide)" with
  "Mode chips appear on the collection home and the section index pages (Photos, Sort, Decide)", and
  note that an item's trail is Collections / {collection} / {item}.

- [ ] **Step 2: ARCHITECTURE.md.** Append to decision 23's *Status* line: "**Superseded in part by
  decision 43:** the home is no longer adaptive (no `WorkspaceState`, no bounded item preview); the pool
  preview and the access-scoped cue stand." Append:

```markdown
**43. Lists and home: card grids with search and pills; the home is the items grid; a phone action bar (UX redesign PR 3, 2026-10-02).**
- *Decision:* `/collections` is a cover-card grid with a server-side `?q=` search (name + description, plain text) and All / Archived pills (`src/features/collections/collectionsList.ts`); owners get a card `···` (Collection settings, Members, Archive / Bring back through the existing `collection:manage` archive/restore routes) with the shared `ArchivedNotice` undo. `/collections/[id]` is the items grid (PR 1's search, pills, `ItemCard`, Archived) with one primary in an `ActionBar` — Start / Keep sorting with an Add photos pill once there is something to sort, else Make items or Add photos — fixed on glass-strong below `md`. The home lists every live item in number order and batch-reads covers for all of them (an unbounded fan-out over the visible ids, accepted; a follow-up bead narrows it to one hero-first row per item with `DISTINCT ON`). `?removed=` is honoured only when id-shaped and verified (an archived item of this collection / an owned archived collection), and `ArchivedNotice` builds its restore URL from `{ kind, id }` — never a passed URL. `/collections/[id]/items` is a guard-then-308 to the home carrying only `status=archived`, `unnamed=1`, `q`, an id-shaped `removed`; breadcrumbs lose the Items level. `FilterPills` is the shared pill primitive.
- *Rationale:* spec §5 (lists and home), §8 item 3; PRODUCT "Familiar first"; one primary action per screen.
- *Status:* Shipped (PR 3). Owner-veto items in the PR body: the retired items list, and collection Archive in the UI (All no longer lists archived collections).
```

- [ ] **Step 3: Full gate** (record each command and result in the PR body):
  `npm run lint && npm run test:ci && npm run build && npm run auth:verify && npm run test:db`, then
  `npm run test:e2e` (the change touches `src/components/ui/**` — CI runs the full suite too, so
  catch it locally first), then the phone gate
  `PW_VIEWPORT=phone npx playwright test e2e/lists-and-home.spec.ts e2e/layout.spec.ts e2e/item-panel.spec.ts`.
- [ ] **Step 4:** `/sync-docs`, then `git add DESIGN.md docs/ARCHITECTURE.md && git commit -m "docs: action bar, lists and home (decision 43)"`.
  The **controller** (not an implementer) then runs `graphify update .` (use `--force` only if the
  graph shrank because symbols were deleted — `ItemPreviewGrid`, `workspaceState`, `CollectionFilters`
  are) and commits `graphify-out/` with `chore(graph): refresh after PR 3`.
- [ ] **Step 5: Screenshots** with the `pr-screenshots` skill (`docs/cookbook/add-images-to-pr.md`):
  `SHOTS=collections,collections-archived,home,home-pool-first,home-items-first,home-archived,collection-paused npm run screenshots`
  and the same with `PW_VIEWPORT=phone` — light and dark, tablet and phone. **Look at every PNG before
  the final review** (PR 1 lesson): the phone bar must not cover the last row, a card row must show
  above the fold on the phone home, the `···` must not crowd a long collection name, pills must wrap
  cleanly at 390px, and the bar's top edge over a white photo in light mode is accepted (ruling G2). Embed inline in the PR body with the
  owner-veto list and the affordance table above.

---

## Self-review

**Spec coverage.** §5 "Collections list becomes a grid of cover-photo cards" → Tasks 3, 4; "search
plus filter pills on top" → Tasks 1, 2, 4 (collections), Task 5 (home, PR 1 pills reused); "overflow
menus" → Task 3 (cards), Task 5 (home `···`); "collection home becomes the items grid with Start
sorting as the single primary action and an Add photos pill beside it" → Task 5; "a fixed bottom action
bar on phone for the one primary action" + glass-strong ≥ 0.85 with blur, ≤ 3 per screen → Task 4
(`ActionBar`), Task 7 (phone geometry in CI). §6 redirects after the guard + enumeration test → Task 6.
§7 selected pill not colour-only → Task 1 unit + Task 7 a11y screens; e2e in CI with the area map
check → Task 7; phone run local → Task 7 Step 6 / Task 8 Step 3. §8 light/dark/phone screenshots →
Task 8 Step 5.

**Placeholder scan.** No TBD/TODO; each code step carries the code. Deletions are explicit `git rm`
lists followed by a `grep` that must print nothing. The two "keep the rest of the comment / the
existing `<ul>` stays" notes refer to text that exists verbatim in the named files.

**Type consistency.** `FilterPill { label, href, current }` (Task 1) is what Task 4 builds from
`COLLECTION_PILLS` + `collectionsViewHref` (Task 2) and what `ItemFilterPills({ path, view, q })`
builds (Task 1; Task 4's items page passes `${collectionHref}/items`, Task 5's home passes `base`).
`CollectionCard.menu` / `CollectionCardMenu({ collectionId, name, href, archived, q })` (Task 3) match
Task 4's call. `ArchivedNotice({ kind, id })` and `isIdShaped` (Task 3) match Tasks 4, 5 and 6;
`BroughtBackNotice` (Task 3) is rendered by Task 4. `ActionBar({ label, children })` (with
`data-action-bar`) + `AppLayout reserveActionBar` (`pb-36`) + the `globals.css` 9rem scroll padding
(Task 4) match Task 5 and Task 7's assertions. `PhotoPoolPreview({ …, showLink })`,
`CollectionHomeMenu({ href, name, isOwner })`, `itemsEmptyState({ …, hasArchived })` and
`FindByCollectionOptions { orderBy }` (Task 5). `redirectRetired(id, "" | "sort" |
"results", query?)` (Task 6) keeps PR 2's two-argument callers valid. `ItemOverflowMenu.listHref`
(Task 6) is set by the panel page in the same task. `seedNamedCollection` (Task 7) returns
`SeededCollectionRef`.

**Review Focus.** (1) Task 2 plain-text search test + Task 4 "ignores a repeated q key and caps…" +
Task 5 "ignores a repeated q key, caps the query at 100…"; (2) Task 3 "builds the restore URL from
kind and id, encoded" + Task 4 "shows Undo only for the viewer's own collection that is archived now"
+ Task 5 "shows the undo notice only for an archived item of this collection" + Task 6 unit (a `../`
`removed` is dropped); (3) Task 4 "owner cards get the ··· menu; a curator's card does not" + Task 5
"a curator's menu offers Add item only"; (4) Task 7 "phone: the bar is pinned to the bottom and never
hides the last row" (incl. card row on load, 144px scroll padding) + Task 4's static-on-short
assertion; (5) Task 6 unit "carries only the allow-listed view, query and an id-shaped notice" + the
one DB crossing "…through the guard, with its allow-listed params" (stranger still bounced by the
existing enumeration case).
