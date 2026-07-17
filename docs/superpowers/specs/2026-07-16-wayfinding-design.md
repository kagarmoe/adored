# Wayfinding — a consistent way back, everywhere

> Adversarially reviewed 2026-07-16 (UX, Craftsman, Graphic Design, QA personas; 16 findings
> folded, 5 refuted). This version is the reviewed spec of record.

## Context

Deep hierarchies (Collections → workspace → Pool, or → Items → Item → Photos, or → Sort →
Session → Compare) have no consistent return affordance:

- **Breadcrumbs exist** on all 23 authenticated pages (`src/components/layout/Breadcrumbs.tsx`
  via `AppLayout`) but are quiet text links with no back-arrow glyph.
- **No back arrow exists anywhere.** The repo convention is "top-left back arrow + breadcrumb;
  top-right user area" — only the arrow is missing. The header wordmark stays the home link.
- **Labels drift** ("Deciding" vs "Results", "Sorting" vs "Sort") because every page hand-builds
  its crumb array; `compare/page.tsx` builds the same array three times in three render branches.
- **`WorkspaceModeChips`** (Build/Sort/Decide) render only on the workspace, so Pool ↔ Items has
  no lateral path.

## Design

**Primary user action:** from any screen, one glance answers "where am I?" and one ≥44px tap
answers "how do I go back one step?"

**Stated invariants** (each gets a test — see Verification):

1. The back arrow always targets the **parent crumb** (second-to-last breadcrumb), never
   browser history. It renders only when there are ≥2 crumbs **and** the parent crumb has an
   `href`; trail builders guarantee every non-last crumb has an `href` (one documented
   exception: an item with a null `number` leaves its crumb unlinked rather than minting a
   broken href — the arrow degrades away instead of 404ing).
2. Every page's `<h1>` answers "where am I"; the phone trail only answers "one step up".
3. Decision surfaces (triage / compare / usage rounds) and leaf pages get **no** mode chips —
   "one decision at a time" means no lateral temptation mid-flow; the back arrow is the exit.
4. One navigation vocabulary: crumbs and chips use the **same words** for the same place.

### 1. Back arrow, fused to the breadcrumb

`Breadcrumbs` renders the arrow itself — every page that passes ≥2 crumbs gets it for free.

- **Glyph:** inline SVG, identical params to the existing carousel chevron
  (`viewBox="0 0 24 24"`, path `M15 6l-6 6 6 6`, `stroke="currentColor"`, `strokeWidth 1.8`,
  `fill="none"`, `aria-hidden`), rendered `h-5 w-5`.
- **Color:** `text-primary` / `hover:text-primary-hover` — the arrow is an action, so it takes
  the action token (DESIGN.md); it must NOT inherit the nav container's `ink-soft`.
- **Hit area without layout shift:** the link box is `h-11 w-11` (44px) with negative margins
  (`-my-3 -ml-2`) so the breadcrumb row keeps its exact current height and `mb-6` rhythm;
  pages with and without an arrow align identically.
- **Tablet a11y (redundant-link pattern):** on `sm:` and up the full trail remains and the
  arrow is pointer-only — `aria-hidden="true"` + `tabIndex={-1}` — because the parent crumb
  link two stops away is the accessible/keyboard path; a second adjacent tab stop to the same
  URL is noise (WCAG 2.4.4 practice).
- **Phone (< `sm`):** the trail collapses to a single fully accessible link: arrow + parent
  label ("← Items"), ≥44px tap height, `aria-label="Back to {parent}"`. No middle-crumb menu.

### 2. One canonical trail, one vocabulary, built in one place

New module **`src/components/layout/breadcrumb-trails.ts`** (co-located with the layout
components so CI's existing `ui` path filter sees it — `src/lib/nav/` would be invisible to
the e2e trigger). Small composing functions returning `{ label, href? }[]`, with
`c = { id, slug?, name }`:

```
trail.collections()            Collections
trail.collectionNew()          Collections / Create
trail.collection(c)            Collections / {name}
trail.collectionEdit(c)        … {name} / Edit
trail.members(c)               … {name} / People
trail.pool(c)                  … {name} / Photos
trail.items(c)                 … {name} / Items
trail.itemNew(c)               … Items / Add item
trail.item(c, item)            … Items / {item display name}
trail.itemEdit(c, item)        … {item} / Edit
trail.itemPhotos(c, item)      … {item} / Photos
trail.sort(c)                  … {name} / Sort
trail.sortNew(c)               … Sort / New session
trail.setAside(c)              … Sort / Set aside        ← reparented (see below)
trail.session(c, n)            … Sort / Session
trail.triage|compare|usage(c, n)  … Session / Triage|Compare|Usage
trail.results(c)               … {name} / Decide
trail.result(c, r)             … Decide / {result name}
trail.finalize(c, r)           … {result name} / Finalize
```

**Vocabulary decision:** crumbs adopt the chip words — **Sort** and **Decide** (drops
"Sorting"/"Deciding"). Rationale: chips and crumbs now co-exist on the same screens
(section 4); one set of words for one geography (Nielsen #4). Chips keep Build/Sort/Decide.

**Set aside is reparented** from the workspace to the Sort hub: its URL (`/sort/set-aside`)
and its flow live in sorting, and the back arrow must return a mid-sort person to their
sorting context, not eject them to the workspace.

`/profile` and `/tutorials` stay as-is: 1-crumb pages, no arrow, no builder needed.

### 3. Lateral wayfinding: mode chips on section indexes

`WorkspaceModeChips` renders on the four collection-scoped **index** pages — Photos (pool),
Items, Sort hub, Decide (results index) — in addition to the workspace.

**aria-current fix:** the component's active chip currently hardcodes `aria-current="page"`,
which would be false on Pool/Items (the active Build chip links to the workspace root).
Add prop `activeExact?: boolean` (default `true`): `true` → `aria-current="page"`;
`false` → `aria-current="true"` (current *section*, not current page). Pool and Items pass
`activeMode="build" activeExact={false}`.

Per invariant 3, chips do NOT appear on rounds, session hub, item detail, or any leaf/form page.

## Implementation

1. `src/components/layout/Breadcrumbs.tsx` — arrow + phone collapse + a11y semantics above.
2. `src/components/layout/breadcrumb-trails.ts` — the builders.
3. `src/features/collections/WorkspaceModeChips.tsx` — `activeExact` prop.
4. ~21 `page.tsx` files under `src/app/collections/**` switch to `trail.*()`; chips added on
   pool/items/sort/results index pages.
5. Tests (see Verification). Grep e2e + unit suites for asserted crumb strings
   ("Sorting", "Deciding", "Results") and update to the canonical labels.

Single PR: the builder exists to make the arrow's parent-target invariant enforceable and to
kill the label drift the arrow makes user-facing; splitting would ship the drift twice.

## Verification

**Unit (vitest, run in `test:ci`):**
- `Breadcrumbs.test.tsx` — arrow renders at ≥2 crumbs targeting the parent href; no arrow at
  1 crumb or when the parent lacks `href`; tablet arrow is `aria-hidden`/`tabIndex=-1`; phone
  link carries `aria-label="Back to {parent}"`.
- `breadcrumb-trails.test.ts` — well-formedness: every non-last crumb has an `href` (invariant 1).
- Extend the four index pages' existing unit tests (precedent:
  `src/app/collections/[id]/page.test.tsx` chips assertions): chips present with correct
  `activeMode`/`aria-current`; triage + compare page tests assert **no** chips (invariant 3).

**e2e (Playwright):**
- Extend `e2e/adaptive-collection-workspace.spec.ts`: arrow present on a deep page, click →
  lands on parent; phone collapse asserted via `page.setViewportSize()` **inside the test**
  (CI runs one webkit project and never sets `PW_VIEWPORT` — an env-gated phone project would
  never run in CI, and a test that doesn't run in CI is not a test).
- **Full local suite** `npm run test:e2e` before the PR — this change touches shared chrome on
  every authenticated page; the broad-blast-radius rule applies, not the 2-spec mapping.

**Gates:** `npm run lint`, `npm run test:ci`, `npm run build`, full local e2e, light + dark
screenshots on the PR.
