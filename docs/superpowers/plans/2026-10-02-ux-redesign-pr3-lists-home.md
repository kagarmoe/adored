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
- Every test runs in CI. DB tier only for real DB crossings (this PR adds none beyond the
  enumeration backstop). E2E runs on tablet in CI; the phone bottom bar is viewport-sensitive, so
  its geometry is asserted in CI with `page.setViewportSize({ width: 390, height: 664 })` inside the
  tablet project (precedent: the wayfinding phone test), and the whole mapped spec also runs locally
  with `PW_VIEWPORT=phone` before the PR.
- New UI-facing modules live under a CI-mapped path (`src/features/**`, `src/components/**`); a new
  `src/lib/<dir>` would be invisible to the e2e trigger (memory `ci-e2e-path-filters-hand-enumerated`).
- Implementers do **not** run `graphify update .` (memory `sdd-implementers-must-not-run-graphify-update`);
  the controller runs it once at the PR boundary (Task 8).
- Commits end with the session attribution lines from the current system reminder. Do not push.

## Review Focus — five uncovered input classes (each pinned in its owning task)

1. **Odd search input on either list** — regex characters (`(`, `.*`), surrounding whitespace, a
   query over 100 characters, a repeated `?q=` key (arrives as `string[]`): plain-text,
   case-insensitive substring of the trimmed query, sliced to 100, an array ignored. Pinned: Task 2
   `collectionsList.test.ts` "searches name and description as plain text…"; Task 4 page test
   "ignores a repeated q key"; PR 1's `filterItems` tests (unchanged) for the home.
2. **A stale or foreign "just archived" id** (`?removed=<id>` bookmarked, already restored, or
   another user's collection) — no false "Archived." notice and no Undo aimed at something that is
   not the viewer's archived thing. Pinned: Task 4 "shows Undo only for the viewer's own collection
   that is archived now"; Task 5 "shows the undo notice only while that item is no longer live".
3. **A curator (non-owner) on the list or the home** — no `···` on their collection cards (Archive,
   settings and members are `collection:manage`), and the home menu offers only **Add item**.
   Pinned: Task 4 "owner cards get the ··· menu; a curator's card does not"; Task 5 "a curator's menu
   offers Add item only".
4. **The phone bar over content** — after scrolling to the bottom of a long grid the last card and the
   footer sit above the bar, the bar stays pinned to the viewport bottom, and on tablet the same bar
   is an inline row above the grid. Pinned: Task 7 e2e "phone: the bar is pinned to the bottom and
   never hides the last row".
5. **Old links to the retired items list** (`/items?status=archived&q=tote&removed=<id>&utm=x`,
   `/items?q=a&q=b`) keep their meaning on the home; unknown or malformed params are dropped; a
   stranger is still bounced by the guard first. Pinned: Task 6 enumeration test "the retired items
   list sends a member home with its view, query and notice".

## Decisions this plan takes where the spec is silent (call them out in review)

- **Collection card content.** Cover photo (4:3, the collection's existing cover), the name in
  Playfair (two lines max), the description (two lines max), the existing "Photos waiting" cue, the
  existing status badge in the Archived view. No counts, no dates, no "sorted" progress — the
  wireframe's "100 items · 38 sorted" is dropped. *Rationale:* TONE never counts; the photo leads.
- **Item card content on the home.** PR 1's `ItemCard` unchanged (cover, name or "Add a name", brand,
  one tier chip once sorted); **no overflow menu on item cards**. *Rationale:* Archive and Delete live
  on the item panel (§3); a second home for them would be a second path to the same action.
- **One grid rhythm.** Both grids are 2 columns on phone, 3 from `md`, 4 from `lg` (the collections
  grid was 1 column on phone). *Rationale:* the resale-app 2-up phone grid; one rhythm across lists.
- **Collections filter pills: All · Archived.** All = active collections; Archived = archived ones.
  The old **Active** pill is folded into All, and `?status=active` (or any junk) reads as All.
  *Rationale:* mirrors the items pills; once Archive is reachable, an "All" that still lists archived
  collections would bury them back in.
- **Home filter pills: PR 1's set unchanged** (All, Archived, Waiting for a name), now linking to the
  home instead of `/items`.
- **Search behaviour (both lists).** A server-side GET form (`?q=`, ≤ 100 characters, a repeated key
  ignored) with a **Search** button — no as-you-type. Plain-text, case-insensitive substring of the
  trimmed query. Collections search name + description; items keep PR 1's fields. The query survives
  a pill change and the pill survives a search. *Rationale:* identical to PR 1's items list; works
  without client JS; stays a Server Component.
- **Collection card `···` (owner only):** **Collection settings**, **Members**, **Archive** (in the
  Archived view: **Bring back** instead). A curator's card has no `···`. No Delete on the card.
  *Rationale:* these are exactly the owner's existing `collection:manage` actions; permanent delete
  stays behind the type-the-name confirm on the settings page.
- **Archive undo.** Archive → `/collections?removed=<id>` and the same "Archived. You'll find it under
  Archived." notice with **Undo** that items use; PR 1's `RemovedItemNotice` is generalized to
  `ArchivedNotice({ restoreUrl })`. The notice renders only when that id is one of the viewer's
  collections and is archived now. A failed Archive / Bring back keeps the card and shows "That didn't
  go through. Try again." under the `···`. *Rationale:* §3's undo pattern, reused; Undo is always near.
- **Home `···` beside the title:** **Add item** (every member), **Collection settings** and
  **Members** (owner). *Rationale:* rarer actions behind an overflow (PRODUCT "Familiar first"), so
  the home keeps one primary and one pill.
- **Empty states.** Collections: no collections at all → "Nothing here yet" / "Begin a collection
  whenever you're ready — there's no rush." (no button inside; the bar carries New collection);
  Archived → "Nothing archived"; a search → "Nothing matches “q”"; All empty but archived exist →
  "Nothing active right now" / "Your archived collections are under Archived." Home: PR 1's
  `itemsEmptyState` copy, **without a button** (the bar carries the action); a home with pool photos
  but no items shows the "Photos waiting" strip instead of an empty state.
- **What the bar shows.** `/collections`: **New collection**. Home: **Start sorting** / **Keep
  sorting** (primary) + **Add photos** pill once the collection has a live item or an open sort;
  **Make items** (primary → pool) alone when only pool photos exist; **Add photos** (primary → pool)
  alone when the collection is empty. No other screen gets a bar in PR 3 (panel, Sort, Ranking are
  unchanged). *Rationale:* §5's one primary action; Start sorting needs something to sort.
- **Phone bar mechanics.** Fixed below `md` (768px: every phone; iPad portrait is 810 and keeps the
  inline row). `bg-glass-strong backdrop-blur-md border-t border-rim shadow-lift`, safe-area bottom
  padding, `z-30` (under the header's `z-40` and the overflow menu's `z-50`). `AppLayout
  reserveActionBar` pads the page bottom (`pb-24 md:pb-0`) so the last row and the footer are never
  behind it. Glass-strong surfaces per screen: header + bar = 2. **No 3-tab bottom nav** (the phone
  wireframe's Home/Sort/You): the spec chose an action bar.
- **Tablet placement of the primary action.** The same `ActionBar` node renders inline: on
  `/collections` at the right of the title row (where New collection is today); on the home as its own
  left-aligned row directly under the title and the Build/Sort/Decide chips, above search — visible
  without scrolling, and first in tab order after the chips.
- **Pool strip.** `PhotoPoolPreview` stays as a "Photos waiting" strip above the grid (All view, no
  query, ≥ 1 loose photo). Its **Make items** link shows only when sorting holds the primary (so the
  name is never on screen twice); its "Add more photos" link is dropped (the Add photos pill does it).
- **The whole collection on the home.** The 12-item preview bound goes; the home lists every live
  item (covers batch-read for the visible items only; `next/image` lazy-loads). Paging is deferred
  until a collection is big enough to need it.
- **Kept on the home:** the Build/Sort/Decide mode chips (navigation, not an action; removing them is
  outside §8 item 3) and PR 2's quiet **See your ranking** link, now under the title with the same
  visibility rule. **Dropped:** the "Created {date}" line (chrome, not the objects).
- **Collection card zoom dropped.** The "View photo" lightbox control leaves collection cards (the
  `···` takes that corner; a collection cover is not a decision moment; zoom stays on the item panel).
- **Retired routes and redirects.** `/collections/[id]/items` (the list only) → 308 to
  `/collections/[id]` after the guard, carrying only `status=archived`, `unnamed=1`, `q` (≤ 100) and
  `removed`; anything else is dropped. Item URLs (`/items/[n]`, `/items/new`) are unchanged. The panel's
  not-found redirect, the non-numeric `…/edit` and `…/photos` bounces, archive's landing, the pool's
  "see them all" notice and the Ranking's number-less fallback all point at the home. Breadcrumbs lose
  the "Items" level: an item reads Collections / {collection} / {item}.
- **Deleted modules:** `workspaceState.ts` (+ test) and `ItemPreviewGrid.tsx` — the home no longer has
  adaptive layouts, only the three primary-action states above, expressed inline.
- **E2E shape.** One new spec, `e2e/lists-and-home.spec.ts`, replaces
  `e2e/adaptive-collection-workspace.spec.ts` (its two wayfinding tests move over verbatim). The CI
  area map adds `src/components/layout/**` and `src/lib/collections/**` to the `collection` area.

### Owner veto (data-changing or route-retiring — flag in the PR body)

1. **`/collections/[id]/items` retires** to a 308 redirect to the collection home (old links and
   bookmarks keep their filter, query and undo notice).
2. **Collection Archive / Bring back reach the UI** for the first time (the owner-only routes existed
   with no caller). Archiving flips `collections.status`; it is reversible from the Archived pill and
   the Undo notice. With it, **All stops listing archived collections** and the Active pill goes.

### Affordances on the surfaces that change (PR 1 lesson: rule on each, nothing lost silently)

| Surface → affordance | Ruling |
|---|---|
| `/collections` New collection button | **Move** into the `ActionBar` (inline on tablet, bottom bar on phone) |
| `/collections` All / Active / Archived pills | **Change** to All / Archived (`FilterPills`); Active folds into All |
| Collection card cover "View photo" lightbox | **Drop** (decision above) |
| Collection card "Photos waiting" cue, status badge | **Keep** |
| `/collections` empty-state "Begin a collection" button | **Drop** from the empty state; the bar holds it |
| `/collections` first-run `/welcome` redirect | **Keep** (unchanged, before any render) |
| Home pool preview: Make items, Add more photos | **Change**: strip keeps thumbnails; Make items = bar primary when no items, else the strip's quiet link; Add more photos → the Add photos pill |
| Home 12-item preview + "View all items" | **Change**: the full grid; the link drops |
| Home "Add item" quiet link | **Move** into the home `···` |
| Home Start / Keep sorting | **Move** into the `ActionBar` (primary) |
| Home "See your ranking" | **Move** under the title (same rule) |
| Home owner nav: Collection settings, Members | **Move** into the home `···` (owner only) |
| Home Build/Sort/Decide chips, description | **Keep** |
| Home "Created {date}" | **Drop** |
| Items list: search, pills, grid, tier chip, Archived + Bring back, undo notice | **Move** to the home |
| Items list "Add photos" / "Add item" buttons | **Move**: Add photos pill in the bar; Add item in the `···` |
| Items list view subtitle ("All", "Archived", …) | **Drop** (the selected pill says it) |

## File map

| Area | Create | Modify | Delete |
|---|---|---|---|
| Primitives | `src/components/ui/FilterPills.tsx` (+test), `src/components/layout/ActionBar.tsx` | `src/components/ui/index.ts`, `src/components/layout/AppLayout.tsx`, `src/features/items/ItemFilterPills.tsx` (+test) | — |
| Collections list | `src/features/collections/collectionsList.ts` (+test), `src/features/collections/CollectionCardMenu.tsx` (+test), `src/app/collections/page.test.tsx` | `src/app/collections/page.tsx`, `src/features/collections/CollectionCard.tsx` (+test) | `src/features/collections/CollectionFilters.tsx` |
| Undo notice | `src/features/items/ArchivedNotice.tsx` (+test, `git mv` from `RemovedItemNotice`) | `src/app/collections/[id]/items/page.tsx` (until Task 6) | `RemovedItemNotice.tsx` (+test) |
| Home | `src/features/collections/CollectionHomeMenu.tsx` | `src/app/collections/[id]/page.tsx` (+test), `src/features/collections/PhotoPoolPreview.tsx` | `ItemPreviewGrid.tsx`, `workspaceState.ts` (+test) |
| Retire `/items` | — | `src/app/collections/[id]/items/page.tsx` (→ redirect), `src/lib/collections/retired-redirect.ts`, `…/items/[itemNumber]/{page,edit/page,photos/page}.tsx`, `ItemOverflowMenu.tsx` (+test), `PoolPhotoGrid.tsx` (+test), `src/app/collections/[id]/results/page.tsx`, `breadcrumb-trails.ts` (+test), `page-authz-enumeration.integration.test.ts` | `src/app/collections/[id]/items/page.test.tsx` |
| E2E / CI | `e2e/lists-and-home.spec.ts` | `e2e/fixtures/seed.ts`, `e2e/item-panel.spec.ts`, `e2e/a11y.spec.ts`, `e2e/image-perf.spec.ts`, `e2e/screenshots/capture.ts`, `.github/workflows/ci.yml` | `e2e/adaptive-collection-workspace.spec.ts` |
| Docs | — | `DESIGN.md` §5, `docs/ARCHITECTURE.md` (decision 23 status, new decision 43) | — |

---

## Task 1: `FilterPills` primitive; `ItemFilterPills` delegates and takes a full path

**Files:** Create `src/components/ui/FilterPills.tsx`, `src/components/ui/FilterPills.test.tsx`.
Modify `src/components/ui/index.ts`, `src/features/items/ItemFilterPills.tsx`,
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

- [ ] **Step 3: Implement.** `src/components/ui/FilterPills.tsx`:

```tsx
import Link from "next/link";

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
              {pill.current && (
                <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
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

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run "src/app/collections/[id]/items"` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5:** `git add src/components/ui/FilterPills.tsx src/components/ui/FilterPills.test.tsx src/components/ui/index.ts src/features/items/ItemFilterPills.tsx src/features/items/ItemFilterPills.test.tsx "src/app/collections/[id]/items/page.tsx" && git commit -m "refactor(ui): FilterPills primitive; item pills take the list path"`

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
];

describe("filterCollections", () => {
  it("All is the active collections; Archived is the archived ones", () => {
    expect(ids(filterCollections(list, { view: "all", q: "" }))).toEqual(["a", "c"]);
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
    expect(collectionsEmptyState({ hasAny: false, view: "all", q: "" }).heading).toBe("Nothing here yet");
    expect(collectionsEmptyState({ hasAny: true, view: "all", q: "" })).toEqual({
      heading: "Nothing active right now",
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

/** All = active, Archived = archived; plain-text search (never a pattern) over name and description. */
export function filterCollections(
  collections: Collection[],
  opts: { view: CollectionsView; q: string },
): Collection[] {
  const status = opts.view === "archived" ? "archived" : "active";
  const needle = opts.q.trim().toLocaleLowerCase();
  return collections.filter(
    (c) =>
      c.status === status &&
      (!needle || [c.name, c.description].some((text) => text?.toLocaleLowerCase().includes(needle))),
  );
}

export function collectionsEmptyState(opts: { hasAny: boolean; view: CollectionsView; q: string }) {
  const q = opts.q.trim();
  if (q) return { heading: `Nothing matches “${q}”`, message: "Try another word, or clear the search." };
  if (opts.view === "archived")
    return { heading: "Nothing archived", message: "Collections you archive rest here, ready to come back whenever you like." };
  if (!opts.hasAny)
    return { heading: "Nothing here yet", message: "Begin a collection whenever you’re ready — there’s no rush." };
  return { heading: "Nothing active right now", message: "Your archived collections are under Archived." };
}
```

- [ ] **Step 4:** Step 2 command → PASS.
- [ ] **Step 5:** `git add src/features/collections/collectionsList.ts src/features/collections/collectionsList.test.ts && git commit -m "feat(collections): list rules — All/Archived views, plain-text search, gentle empty states"`

## Task 3: Collection card `···` (owner) and the shared Archived notice

**Files:** Create `src/features/collections/CollectionCardMenu.tsx`,
`src/features/collections/CollectionCardMenu.test.tsx`. Modify
`src/features/collections/CollectionCard.tsx`, `src/features/collections/CollectionCard.test.tsx`.
`git mv` `src/features/items/RemovedItemNotice.tsx` → `src/features/items/ArchivedNotice.tsx` and its
test → `ArchivedNotice.test.tsx`; modify both; modify `src/app/collections/[id]/items/page.tsx` (the
notice call) and the comment in `src/features/items/ItemOverflowMenu.tsx` that names `RemovedItemNotice`.

**Interfaces:**
- Produces: `CollectionCard({ collection, coverPhotoUrl?, hasPooledPhotos?, menu? })` — `menu?: React.ReactNode`
  renders top-right above the stretched link; **`viewerPhoto` is removed**.
- Produces: `CollectionCardMenu({ collectionId, name, href, archived })` — `collectionId` is the ULID
  (the API takes the id), `href` is `/collections/{slug ?? id}`; trigger label `More for {name}`;
  items `Collection settings`, `Members`, then `Archive` or `Bring back`. Archive success →
  `router.push("/collections?removed={collectionId}")`; Bring back success → `router.refresh()`;
  failure → `role="alert"` "That didn’t go through. Try again."
- Produces: `ArchivedNotice({ restoreUrl }: { restoreUrl: string })` — same copy and behaviour as
  PR 1's `RemovedItemNotice` (focus on mount, Undo → POST `restoreUrl` → strip `removed`, Done → strip `removed`).

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

const props = { collectionId: "col_1", name: "Summer bags", href: "/collections/summer-bags" };
const open = () => fireEvent.click(screen.getByRole("button", { name: "More for Summer bags" }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("CollectionCardMenu", () => {
  it("offers settings, members and Archive; Archive lands on the list with the undo notice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CollectionCardMenu {...props} archived={false} />);
    open();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Collection settings", "Members", "Archive"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections?removed=col_1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/col_1/archive", { method: "POST" });
  });

  it("in the Archived view offers Bring back, which restores in place", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<CollectionCardMenu {...props} archived />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Bring back" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/collections/col_1/restore", { method: "POST" });
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
  it("renders the menu slot alongside the single navigating link", () => {
    render(<CollectionCard collection={collection as any} menu={<button type="button">More</button>} />);
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /view photo/i })).not.toBeInTheDocument();
  });
```

Rename the notice: `git mv src/features/items/RemovedItemNotice.tsx src/features/items/ArchivedNotice.tsx`
and `git mv src/features/items/RemovedItemNotice.test.tsx src/features/items/ArchivedNotice.test.tsx`.
In the test, replace the import with `import { ArchivedNotice } from "./ArchivedNotice";`, every
`<RemovedItemNotice itemId="…" />` render with `<ArchivedNotice restoreUrl="/api/items/<same id>/restore" />`,
and add one test:

```tsx
  it("posts to the restore URL it is given (collections reuse it)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<ArchivedNotice restoreUrl="/api/collections/col_9/restore" />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/collections/col_9/restore", { method: "POST" }));
  });
```

(Import `fireEvent`/`waitFor`/`vi` if the file does not already; unstub globals in an `afterEach`.)

- [ ] **Step 2:** `npx vitest run src/features/collections src/features/items/ArchivedNotice.test.tsx` → FAIL
  (`CollectionCardMenu` missing; `menu` slot not rendered; `ArchivedNotice` export missing).

- [ ] **Step 3: Implement.** `src/features/collections/CollectionCardMenu.tsx`:

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
}

// Rendered for the owner only: every action here is collection:manage server-side.
// Archive is the existing reversible status flip; its Undo waits on the list
// (ArchivedNotice, keyed by ?removed=). Permanent delete stays on the settings page.
export function CollectionCardMenu({ collectionId, name, href, archived }: CollectionCardMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(action: "archive" | "restore") {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/collections/${collectionId}/${action}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    if (action === "archive") router.push(`/collections?removed=${collectionId}`);
    else router.refresh();
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
      <OverflowMenu label={`More for ${name}`} items={items} />
      {failed && (
        <p role="alert" className="rounded-pill bg-surface-raised px-3 py-1 text-sm text-ink shadow-lift">
          That didn’t go through. Try again.
        </p>
      )}
    </div>
  );
}
```

`src/features/collections/CollectionCard.tsx` — replace the props and the two edges of the JSX:

```tsx
import type { Collection } from "@/types";
import { Badge, Card } from "@/components/ui";
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

Keep the cover block and the body as they are, except the body padding `p-5` → `p-3` (two columns on
a phone). Replace the last two lines inside `<Card>` (the `<Link>` stays; the `PhotoViewControl` line goes) with:

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
  /** POST endpoint that undoes the archive: /api/items/{id}/restore or /api/collections/{id}/restore. */
  restoreUrl: string;
}

// The undo half of an archive (an item from its panel, a collection from its card):
// the archiving surface lands on the list with ?removed=<id>; this notice …(keep the rest of the comment)
export function ArchivedNotice({ restoreUrl }: ArchivedNoticeProps) {
```

and in `restore()` use `const res = await fetch(restoreUrl, { method: "POST" });`.
In `src/app/collections/[id]/items/page.tsx`: import `ArchivedNotice` from `@/features/items/ArchivedNotice`
and render `<ArchivedNotice restoreUrl={`/api/items/${searchParams.removed}/restore`} />`. In
`ItemOverflowMenu.tsx`'s header comment replace `RemovedItemNotice` with `ArchivedNotice`. Then
`grep -rn "RemovedItemNotice" src e2e` → prints nothing.

- [ ] **Step 4:** Step 2 command → PASS; `npx tsc --noEmit` → the only errors are in
  `src/app/collections/page.tsx` (`viewerPhoto`), fixed in Task 4 — note them, do not patch here
  beyond deleting the `viewerPhoto={…}` prop so the build stays green.
- [ ] **Step 5:** `git add -A src/features/collections src/features/items "src/app/collections/[id]/items/page.tsx" src/app/collections/page.tsx && git commit -m "feat(collections): owner ··· on cards (settings, members, archive); shared ArchivedNotice"`

## Task 4: `ActionBar`, and `/collections` becomes the searchable cover-card grid

**Files:** Create `src/components/layout/ActionBar.tsx`, `src/app/collections/page.test.tsx`. Modify
`src/components/layout/AppLayout.tsx`, `src/app/collections/page.tsx`. Delete
`src/features/collections/CollectionFilters.tsx`.

**Interfaces:**
- Consumes: Task 1 `FilterPills`; Task 2 `collectionsViewFrom`, `collectionsViewHref`,
  `filterCollections`, `collectionsEmptyState`, `COLLECTION_PILLS`; Task 3 `CollectionCard.menu`,
  `CollectionCardMenu`, `ArchivedNotice`.
- Produces: `ActionBar({ label, children }: { label: string; children: React.ReactNode })` — a
  `<section aria-label={label}>`; pages import it from `@/components/layout/ActionBar` (not the
  barrel, so page tests can keep mocking `@/components/layout`). `AppLayout` gains
  `reserveActionBar?: boolean`.
- URL contract for `/collections`: `?status=archived`, `?q=` (≤ 100), `?removed=<collectionId>`.

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

  it("ignores a repeated q key and caps the query at 100 characters", async () => {
    await renderPage({ q: ["a", "b"] });
    expect(screen.getByRole("searchbox", { name: "Search your collections" })).toHaveValue("");
    await renderPage({ q: "x".repeat(150) });
    expect(screen.getAllByRole("searchbox", { name: "Search your collections" }).at(-1)).toHaveValue("x".repeat(100));
  });

  it("shows Undo only for the viewer's own collection that is archived now", async () => {
    await renderPage({ removed: "col_c" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    for (const removed of ["col_a" /* restored already */, "col_zzz" /* not theirs */]) {
      document.body.innerHTML = "";
      await renderPage({ removed });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("reads covers and the pool cue for the visible collections only (the access boundary)", async () => {
    await renderPage();
    expect(photoController.findCoverPhotosByCollectionIds).toHaveBeenCalledWith(["col_a", "col_b"]);
    expect(photoController.findCollectionIdsWithPooledPhotos).toHaveBeenCalledWith(["col_a", "col_b"]);
  });

  it("gentle empty state with no button inside it (the bar carries New collection)", async () => {
    collectionController.listCollections.mockResolvedValue([ARCHIVED]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Nothing active right now" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /collection/i }).map((l) => l.textContent)).toEqual(["New collection"]);
  });
});
```

(`role="status"` is the `ArchivedNotice` container; the `mockRedirect` only fires for the
not-signed-in and first-run cases, which keep their existing tests in `src/features/onboarding`.)

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
// AA from its own ≥0.85 opacity, never from what scrolls behind it. One DOM node for
// both, so the action is never duplicated. Pages that use it set AppLayout's
// reserveActionBar so the last row and the footer never sit behind it.
export function ActionBar({ label, children }: ActionBarProps) {
  return (
    <section
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-rim bg-glass-strong px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md [&>*:first-child]:flex-1 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none md:[&>*:first-child]:flex-none"
    >
      {children}
    </section>
  );
}
```

`src/components/layout/AppLayout.tsx`: add `reserveActionBar?: boolean` to `AppLayoutProps`, destructure
it, and change the root to

```tsx
    <div className={`flex min-h-screen flex-col bg-ground ${reserveActionBar ? "pb-24 md:pb-0" : ""}`}>
```

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
import Link from "next/link";

type Param = string | string[] | undefined;

interface CollectionsPageProps {
  searchParams?: Promise<{ status?: Param; q?: Param; removed?: Param }>;
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
  // The undo notice only for one of the viewer's own collections that is archived
  // right now — a stale, restored or foreign id renders nothing.
  const removed = searchParams?.removed;
  const justArchived =
    typeof removed === "string" &&
    collections.some((c) => c.id === removed && c.status === "archived" && c.ownerId === session.user.id)
      ? removed
      : null;

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

        {justArchived && <ArchivedNotice restoreUrl={`/api/collections/${justArchived}/restore`} />}

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
          <EmptyState heading={empty.heading} message={empty.message} />
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

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run src/features/collections src/components` → PASS;
  `npm run build` → PASS.
- [ ] **Step 5:** `git add -A src/components/layout src/app/collections/page.tsx src/app/collections/page.test.tsx src/features/collections && git commit -m "feat(collections): searchable cover-card grid with All/Archived pills and a phone action bar"`

## Task 5: The collection home becomes the items grid

**Files:** Create `src/features/collections/CollectionHomeMenu.tsx`. Modify
`src/app/collections/[id]/page.tsx`, `src/app/collections/[id]/page.test.tsx` (rewrite),
`src/features/collections/PhotoPoolPreview.tsx`. Delete `src/features/collections/ItemPreviewGrid.tsx`,
`src/features/collections/workspaceState.ts`, `src/features/collections/workspaceState.test.ts`.

**Interfaces:**
- Consumes: Task 1 `ItemFilterPills({ path, view, q })`; Task 3 `ArchivedNotice({ restoreUrl })`;
  Task 4 `ActionBar`, `AppLayout reserveActionBar`; PR 1 `filterItems`, `itemsEmptyState`, `ItemCard`,
  `ArchivedItemCard`, `ItemController.listArchived`; PR 2 `KeepSortingButton`.
- Produces: `CollectionHomeMenu({ href, name, isOwner })` — trigger `More for {name}`; items `Add item`
  (+ owner: `Collection settings`, `Members`). `PhotoPoolPreview({ collectionId, poolHref, photos, showLink })`
  — region named **Photos waiting**; `actionVariant` removed.
- Home URL contract (moved from `/items`): `?status=archived`, `?unnamed=1`, `?q=` (≤ 100), `?removed=<itemId>`.

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

(the other `vi.mock` lines stay). In `beforeEach` add `itemRepo.findArchivedByCollection.mockResolvedValue([])`.
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
    expect(itemRepo.findByCollection).toHaveBeenCalledWith(COLLECTION_ID, undefined); // no preview bound
    expect(screen.queryByRole("link", { name: "View all items" })).not.toBeInTheDocument();
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

  it("shows the undo notice only while that item is no longer live", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage({ removed: "item_9" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    document.body.innerHTML = "";
    await renderPage({ removed: "item_1" }); // still live: a stale link
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("one primary action, in the Next step bar", () => {
  it("items and no sort: Start sorting leads, Add photos is the pill beside it", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    const { container } = await renderPage();
    const start = within(bar()).getByRole("button", { name: "Start sorting" });
    expect(start.className).toContain("bg-primary");
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
    expect(screen.getByRole("region", { name: "Photos waiting" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sorting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No items yet" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("pool photos and items: the strip's quiet Make items link appears beside Start sorting", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage();
    const strip = screen.getByRole("region", { name: "Photos waiting" });
    expect(within(strip).getByRole("link", { name: "Make items" }).className).not.toContain("bg-primary");
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

- [ ] **Step 2:** `npx vitest run "src/app/collections/[id]/page.test.tsx"` → FAIL.

- [ ] **Step 3: Implement.** `src/features/collections/CollectionHomeMenu.tsx`:

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

`src/features/collections/PhotoPoolPreview.tsx` — props become
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
        {/* the existing thumbnail <ul> stays as is */}
        {showLink && (
          <Link href={poolHref} className={quietLink}>
            Make items
          </Link>
        )}
      </Card>
    </section>
```

Update the component comment: "Read-only strip of loose pool photos above the home grid. Its Make
items link shows only when sorting holds the page's primary action; otherwise the bar's primary is
Make items itself (one name on screen once)."

`src/app/collections/[id]/page.tsx` — replace the file:

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
import { ItemFilterPills, type ItemsView } from "@/features/items/ItemFilterPills";
import { filterItems, itemsEmptyState } from "@/lib/items";
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
  const [pool, liveItems, archivedItems, sessions, preferences] = await Promise.all([
    PhotoController.fromDb(db).findPoolByCollection(collection.id, 6),
    itemController.listItems(collection.id),
    view === "archived" ? itemController.listArchived(collection.id) : Promise.resolve([]),
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
  // The archive undo (purses-v7gv), only while that id is not in the live list.
  const removed = searchParams?.removed;
  const justArchived =
    typeof removed === "string" && view !== "archived" && !liveItems.some((i) => i.id === removed) ? removed : null;
  const empty = itemsEmptyState({ hasAnyItems: items.length > 0, view, q });
  const poolOnly = showPool && liveItems.length === 0;

  return (
    <AppLayout breadcrumbs={trail.collection(collection)} reserveActionBar>
      <div className="space-y-8">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl text-ink sm:text-3xl">{collection.name}</h1>
            {collection.description && <p className="mt-2 text-ink-soft">{collection.description}</p>}
            {hasEverSorted && (
              <Link href={`${base}/results`} className={`${quietLink} mt-2`}>
                See your ranking
              </Link>
            )}
          </div>
          <CollectionHomeMenu href={base} name={collection.name} isOwner={collection.ownerId === session.user.id} />
        </header>

        <WorkspaceModeChips base={base} activeMode="build" />

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

        {justArchived && <ArchivedNotice restoreUrl={`/api/items/${justArchived}/restore`} />}

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
            <Input type="search" name="q" defaultValue={q} label="Search your items" placeholder="Name, brand, color…" maxLength={100} />
            <Button type="submit" variant="secondary" className="h-12">
              Search
            </Button>
          </form>
          <ItemFilterPills path={base} view={view} q={q} />
        </div>

        {visible.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
          !poolOnly && <EmptyState heading={empty.heading} message={empty.message} />
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

- [ ] **Step 4:** Step 2 command → PASS; `npx vitest run src/features/collections src/app/collections` → PASS; `npm run build` → PASS.
- [ ] **Step 5:** `git add -A src/features/collections "src/app/collections/[id]/page.tsx" "src/app/collections/[id]/page.test.tsx" && git commit -m "feat(home): the collection home is the items grid — Start sorting with Add photos beside it"`

## Task 6: Retire the items list; every link points home; enumeration test

**Files:** Replace `src/app/collections/[id]/items/page.tsx`. Delete
`src/app/collections/[id]/items/page.test.tsx`. Modify `src/lib/collections/retired-redirect.ts`;
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
    it("the retired items list sends a member home with its view, query and notice", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const home = `/collections/slug-${collectionId}`;
      const mod = (await import("@/app/collections/[id]/items/page")) as {
        default: (p: {
          params: Promise<{ id: string }>;
          searchParams?: Promise<Record<string, string | string[]>>;
        }) => Promise<unknown>;
      };
      const go = (sp?: Record<string, string | string[]>) =>
        mod
          .default({ params: Promise.resolve({ id: collectionId }), searchParams: sp && Promise.resolve(sp) })
          .catch((e: Error) => e.message);
      try {
        expect(await go()).toBe(`NEXT_PERMANENT_REDIRECT:${home}`);
        expect(await go({ status: "archived", q: "tote", removed: "itm_1", utm: "x" })).toBe(
          `NEXT_PERMANENT_REDIRECT:${home}?status=archived&q=tote&removed=itm_1`,
        );
        expect(await go({ q: ["a", "b"], unnamed: "1", status: "nope" })).toBe(`NEXT_PERMANENT_REDIRECT:${home}?unnamed=1`);
        expect(await go({ q: "y".repeat(150) })).toBe(`NEXT_PERMANENT_REDIRECT:${home}?q=${"y".repeat(100)}`);
      } finally {
        mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      }
    });
```

(The stranger case `p("collections/[id]/items", { id })` stays: the guard still bounces them first.)

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

- [ ] **Step 2:** `npx vitest run src/components/layout/breadcrumb-trails.test.ts src/features/items/ItemOverflowMenu.test.tsx src/features/pool/PoolPhotoGrid.test.tsx` → FAIL;
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

type Param = string | string[] | undefined;

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, Param>>;
}

// The collection home is the items grid now (spec §5). Old links keep their view,
// query and undo notice; anything else is dropped. Only allow-listed values are
// copied, never interpolated raw. The guard runs first, inside redirectRetired.
export default async function ItemsListRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const keep = new URLSearchParams();
  if (sp.status === "archived") keep.set("status", "archived");
  if (sp.unnamed === "1") keep.set("unnamed", "1");
  if (typeof sp.q === "string" && sp.q.trim()) keep.set("q", sp.q.slice(0, 100));
  if (typeof sp.removed === "string") keep.set("removed", sp.removed);
  return redirectRetired(id, "", keep);
}
```

`git rm -q "src/app/collections/[id]/items/page.test.tsx"`.

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
`e2e/screenshots/capture.ts`, `.github/workflows/ci.yml` (`collection:` filter ~347-352, the
`A_COLLECTION`/`A_ITEMS` lines ~449-457). Delete `e2e/adaptive-collection-workspace.spec.ts`.

**Interfaces:** Consumes the accessible names from Tasks 3-6: region `Next step`; links `New
collection`, `Add photos`, `Make items`, `All`, `Archived`, `See your ranking`; buttons `Start
sorting`, `Keep sorting`, `More for {name}`, `Search`, `Undo`; menuitems `Archive`, `Bring back`;
searchboxes `Search your collections`, `Search your items`; region `Photos waiting`; text
`/^Archived\./`, `Nothing matches “…”`. Produces
`seedNamedCollection(ownerId, name, status?) → { collectionId, slug }`.

Coverage map for the deletion: the four adaptive-state tests → this spec's home tests (states are now
the bar's three primaries); the wayfinding back-arrow and phone-collapse tests → copied verbatim; the
keyboard-order test → rewritten for the new order.

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
let empty: SeededCollectionRef;
let shelf: { name: string } & SeededCollectionRef;
let long: { slug: string };

test.beforeAll(async () => {
  ownerId = await seedBaseline();
  ({ poolOnly, itemsOnly, empty } = await seedWorkspaceStates(ownerId));
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
  const home = `/collections/${itemsOnly.slug}`;
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

test("home before items: Make items leads when photos wait; Add photos when empty", async ({ page }) => {
  await page.goto(`/collections/${poolOnly.slug}`);
  const bar = page.getByRole("region", { name: "Next step" });
  await expect(page.getByRole("region", { name: "Photos waiting" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Make items" })).toHaveAttribute("href", `/collections/${poolOnly.slug}/pool`);
  await expect(page.getByRole("button", { name: /sorting/ })).toHaveCount(0);

  await page.goto(`/collections/${empty.slug}`);
  await expect(bar.getByRole("link", { name: "Add photos" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Add photos" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /sorting/ })).toHaveCount(0);
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
  await pinned();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barBox = await pinned();
  const cards = page.locator("main ul.grid > li"); // the grid, not the crumbs or pills
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

  await page.setViewportSize(PHONE);
  await page.goto("/collections");
  await expect(page.getByRole("region", { name: "Next step" }).getByRole("link", { name: "New collection" })).toBeInViewport();
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

test("keyboard order on the home: trail → menu → chips → primary → pill → search → cards", async ({ page }) => {
  await page.goto(`/collections/${itemsOnly.slug}`);
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
`e2e/adaptive-collection-workspace.spec.ts` to the end of this file, and
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

- [ ] **Step 5: CI map.** In `ci.yml` add to the `collection:` filter

```yaml
              - 'src/components/layout/**'
              - 'src/lib/collections/**'
```

  and change the two selection lines to

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
  → PASS. Local gate (not CI): `PW_VIEWPORT=phone npx playwright test e2e/lists-and-home.spec.ts e2e/layout.spec.ts e2e/item-panel.spec.ts`.
- [ ] **Step 7:** `git add -A e2e .github/workflows/ci.yml && git commit -m "test(e2e): lists-and-home journey with the phone bar; CI map and screenshot surfaces follow"`

## Task 8: Docs, full gate, graphify, screenshots

**Files:** Modify `DESIGN.md` §5 (Components), `docs/ARCHITECTURE.md` (decision 23's status line;
append decision 43). `docs/API.md` is untouched (no route or contract changed — the archive/restore
routes already documented).

- [ ] **Step 1: DESIGN.md §5.** Add after **Glass panel**:

```markdown
- **Action bar:** the page's one primary action (`ActionBar`, `src/components/layout/ActionBar.tsx`).
  From `md` up an inline row where the page places it; on phone a fixed bottom bar on `glass-strong`
  + backdrop blur + a `rim` top edge, with safe-area padding, and the page reserves its height
  (`AppLayout reserveActionBar`) so the last row and the footer never sit behind it. It holds the
  primary and at most one pill beside it (the home's **Add photos**). One per screen; with the header
  it is the second of the three glass-strong surfaces a screen may carry.
```

  In **Cards** append: "Collection cards carry the owner's `···` (top-right, above the stretched
  link); item cards carry none — their rarer actions live on the item panel." In **Wayfinding**
  replace "Mode chips appear on section **index** pages only (Photos, Items, Sort, Decide)" with
  "Mode chips appear on the collection home and the section index pages (Photos, Sort, Decide)", and
  note that an item's trail is Collections / {collection} / {item}.

- [ ] **Step 2: ARCHITECTURE.md.** Append to decision 23's *Status* line: "**Superseded in part by
  decision 43:** the home is no longer adaptive (no `WorkspaceState`, no bounded item preview); the pool
  preview and the access-scoped cue stand." Append:

```markdown
**43. Lists and home: card grids with search and pills; the home is the items grid; a phone action bar (UX redesign PR 3, 2026-10-02).**
- *Decision:* `/collections` is a cover-card grid with a server-side `?q=` search (name + description, plain text) and All / Archived pills (`src/features/collections/collectionsList.ts`); owners get a card `···` (Collection settings, Members, Archive / Bring back through the existing `collection:manage` archive/restore routes) with the shared `ArchivedNotice` undo. `/collections/[id]` is the items grid (PR 1's search, pills, `ItemCard`, Archived) with one primary in an `ActionBar` — Start / Keep sorting with an Add photos pill once there is something to sort, else Make items or Add photos — fixed on glass-strong below `md`. `/collections/[id]/items` is a guard-then-308 to the home carrying only `status=archived`, `unnamed=1`, `q`, `removed`; breadcrumbs lose the Items level. `FilterPills` is the shared pill primitive.
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
  the final review** (PR 1 lesson): the phone bar must not cover the last row, the `···` must not
  crowd a long collection name, pills must wrap cleanly at 390px. Embed inline in the PR body with the
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
`CollectionCard.menu` / `CollectionCardMenu({ collectionId, name, href, archived })` (Task 3) match
Task 4's call. `ArchivedNotice({ restoreUrl })` (Task 3) matches Tasks 4 and 5. `ActionBar({ label,
children })` + `AppLayout reserveActionBar` (Task 4) match Task 5. `PhotoPoolPreview({ …, showLink })`
and `CollectionHomeMenu({ href, name, isOwner })` (Task 5). `redirectRetired(id, "" | "sort" |
"results", query?)` (Task 6) keeps PR 2's two-argument callers valid. `ItemOverflowMenu.listHref`
(Task 6) is set by the panel page in the same task. `seedNamedCollection` (Task 7) returns
`SeededCollectionRef`.

**Review Focus.** (1) Task 2 plain-text search test + Task 4 "ignores a repeated q key and caps…";
(2) Task 4 "shows Undo only for the viewer's own collection that is archived now" + Task 5 "shows the
undo notice only while that item is no longer live"; (3) Task 4 "owner cards get the ··· menu; a
curator's card does not" + Task 5 "a curator's menu offers Add item only"; (4) Task 7 "phone: the bar
is pinned to the bottom and never hides the last row"; (5) Task 6 "the retired items list sends a
member home with its view, query and notice" (stranger still bounced by the existing enumeration case).
