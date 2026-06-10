---
target: Collections home (/collections)
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-06-10T03-41-15Z
slug: src-app-collections-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No skeleton/loading state; each "0 items" count is wrong, so status actively lies |
| 2 | Match System / Real World | 2 | "Organize and sort your favorite items" is inventory/management voice — the exact framing TONE.md forbids |
| 3 | User Control and Freedom | 3 | Filters reversible, breadcrumb back, no destructive traps |
| 4 | Consistency and Standards | 3 | Uses the design system cleanly; deviation is `<button>` nested in `<a>` |
| 5 | Error Prevention | 3 | Little to get wrong on this surface |
| 6 | Recognition Rather Than Recall | 3 | Everything visible and labeled |
| 7 | Flexibility and Efficiency | 2 | Each filter is a full page navigation; no keyboard affordances |
| 8 | Aesthetic and Minimalist Design | 2 | Identical 3-col cards + 📷 placeholder + count/date density pulls toward catalog |
| 9 | Error Recovery | 2 | No error state on this surface; gap rather than failure |
| 10 | Help and Documentation | 1 | None beyond the empty state |
| **Total** | | **23/40** | **Acceptable — significant improvements needed before it feels like *this* product** |

## Anti-Patterns Verdict

**LLM assessment:** It does not scream "AI generated" — the design system is real and applied with discipline (consistent Button/Card/Badge/EmptyState, AA-passing tokens, Playfair headings via global CSS). The danger here is not generic AI flatness; it is **strangeness-of-register**: this is the one screen most at risk of becoming the **catalog/inventory grid** PRODUCT.md says the product must *never* be. Three same-sized cards per row, each carrying an emoji photo placeholder, an item **count**, and a **last-updated date**, is the literal shape of an inventory grid — and it trips the shared "identical card grids" absolute ban.

**Deterministic scan:** `detect.mjs` over `page.tsx`, `CollectionCard.tsx`, `CollectionFilters.tsx`, `EmptyState.tsx` returned `[]` (exit 0, clean). No gradient text, eyebrows, side-stripe borders, or glassmorphism. The mechanical layer is clean; the register-level finding above is the LLM's, not the detector's.

**Visual overlays:** Not available. `/collections` is auth-gated (redirects to `/login`) and needs a seeded DB + session; no dev server was running. No reliable user-visible overlay was produced — this is a reported fallback, not a claimed overlay.

## Overall Impression

The craft is here; the *frame* is the problem. A returning user lands on "Your Collections / Organize and sort your favorite items" above a tidy grid of count-and-date cards. That is a competent **collection manager**. But PurseInator is not a manager — it helps a person *recognize what they love*. The single biggest opportunity is to make this entry screen speak from the person's side (warmth, recognition) instead of the machine's side (organize, count, manage), and to make each collection feel like a place you return to rather than a row in a stock list.

## What's Working

- **Disciplined design-system usage.** Every primitive is the shared component — no one-off buttons, no rogue colors. Headings correctly resolve to Playfair via global CSS, ink not teal. This is the hard part and it's done.
- **Empty state already teaches.** The zero-collections branch gives a heading, a reason, and a single clear action — and there's a *second* empty state for an empty filter result. Thoughtful; most teams ship only the first.
- **Restraint holds.** Calm spacing (`space-y-8`), one primary action, AA-passing `ink-soft` (~5.45:1). The room is quiet, as intended.

## Priority Issues

- **[P1] The screen reads as an inventory catalog, not a gallery of things you love.** Identical cards, emoji thumbnails, item counts, and dates are catalog/SKU framing — explicitly an anti-reference in PRODUCT.md and the "identical card grids" absolute ban.
  - **Why it matters:** This is the product's most-stated identity line ("not a catalog, not an inventory tool, not a shopping site"). The entry screen is where that promise is first kept or broken.
  - **Fix:** Let the *cover photograph* be the loudest thing on each card (real image, generous height), demote or drop the item-count and date, and vary the grid so it reads as a wall of remembered places, not a stock table. Replace the 📷 emoji with a calm branded placeholder (soft aqua field + a quiet glyph), `aria-hidden`.
  - **Suggested command:** `/impeccable layout`

- **[P1] Copy speaks from the machine's side.** "Organize and sort your favorite items" and "Create your first collection to start organizing items" use the manage/organize/inventory register TONE.md forbids ("track / manage your stuff").
  - **Why it matters:** TONE.md is first-order; the litmus test ("person's side, not machine's side") fails on the very first line a user reads.
  - **Fix:** Rewrite toward recognition: e.g. subhead "The things you're deciding about, gathered in one calm place." Empty state toward invitation, not setup.
  - **Suggested command:** `/impeccable clarify`

- **[P1] Every card shows "0 items" — the status lies.** `CollectionCard` accepts `itemCount` (default `0`) and `curators` (default `[]`), but `collections/page.tsx` never passes either, so the count is hardcoded-by-omission to 0 for every collection.
  - **Why it matters:** A confident wrong number is worse than no number — it erodes trust on the first screen, and a screen reader announces "0 items" for a full collection.
  - **Fix:** Either wire real counts through the repository, or (better, given the catalog concern) remove the count from the card entirely and let the photo carry the collection.
  - **Suggested command:** `/impeccable harden`

- **[P2] Fixed `grid-cols-3` is not responsive.** The grid is `grid grid-cols-3 gap-4` at every width — three columns on a phone, three on a tablet in portrait. This is a tablet-first product.
  - **Why it matters:** On narrow tablet/phone widths the cards crush; the viewport is part of the design.
  - **Fix:** `repeat(auto-fit, minmax(280px, 1fr))` or explicit breakpoints (1 → 2 → 3).
  - **Suggested command:** `/impeccable adapt`

- **[P2] Buttons nested inside links.** Header (`<Link><Button>New Collection</Button></Link>`) and `CollectionFilters` (`<Link><Button/></Link>`) render a `<button>` inside an `<a>` — invalid HTML (interactive content in an anchor) and an a11y/focus hazard.
  - **Why it matters:** Sam (screen reader / keyboard) hits ambiguous nested interactives; behavior is browser-dependent.
  - **Fix:** Give `Button` an `asChild`/`as` escape hatch, or style the `Link` as a button directly. Don't nest the two.
  - **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Jordan (First-Timer):** Lands on "Organize and sort your favorite items" with no sense of *why* — sounds like a file manager, not a place to find what they love. The 📷 emoji on every card reads as "image failed to load." First impression: a tool to maintain, not a space to enter.

**Riley (Stress Tester):** Immediately clocks that a collection they *know* has 30 items says "0 items." Trust gone on screen one. Also: with many collections, the fixed 3-col grid and per-card count/date turn the page into a spreadsheet; with a long collection name the `line-clamp-2` truncates silently.

**Maya (the reluctant decider — project persona):** Holding sentimental, emotionally-weighted things; not a power user. The word "Organize" lands as a chore; "items" reduces her grandmother's letters to stock. She wanted a gentle place to begin recognizing what she loves; she got an inventory screen. Nothing here says *you're allowed to take your time*.

## Minor Observations

- Card title `<h3>` becomes Playfair via global CSS — appropriate for collection names (tender), but confirm it's intentional vs. DESIGN.md's Inter "Title" role for card titles.
- Footer "© 2026 PurseInator. All rights reserved." is corporate boilerplate on an intimate product — quietly off-tone.
- Filters do a full page navigation per click (server `searchParams`); fine functionally, but no active-state transition, so the change feels abrupt.
- `📷` emoji has no `aria-hidden`; screen readers may announce "camera."

## Questions to Consider

- What if the cover **photograph** were the card — image-first, with the name as a quiet caption — instead of a content card that happens to have a thumbnail?
- Does the top level need counts and dates at all? What would this screen feel like if a collection were simply a *place*, not a *record*?
- What would the most affirming possible first line be here — one that makes Maya feel welcomed rather than assigned a task?
