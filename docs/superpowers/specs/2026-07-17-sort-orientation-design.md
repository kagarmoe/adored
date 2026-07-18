# Sort orientation Phase 1 — design

**Date:** 2026-07-17 · **Epic:** purses-g9vg · **Branch:** feat/sort-orientation
**Authority:** proposal rev 2 (merged #358) + owner decisions 2026-07-17: compare question = **"Which would you reach for first?"**; results stay plain **"Results"**; Part 1b amendments approved as drafted; Phases 1 AND 2 approved (this spec is Phase 1; Phase 2 gets its own spec after).

## Verified facts (fresh fact-check)

- **Images:** every results surface passes an optional cover URL into `CardImage`, which falls back to the item's initial letter — EXCEPT (a) `shared-results/[token]/page.tsx` never fetches covers at all (photos never render there), and (b) `RerankPanel`'s reorder rows fall back to a blank `aria-hidden` span, not the initial glyph. The MUST therefore means: fetch covers on the shared page; unify the reorder fallback.
- **Progress inputs:** no aggregate queries exist; the session hub page already fetches `preferences`, curator decisions, and `dispositions`. Triage coverage = preference rows (+ set-aside dispositions) vs `items.length`; usage = `deriveUsage(events, itemIds).size` (already server-computed for the usage page); compare: `CollectionPreferenceItem.confidence` is persisted and currently unsurfaced.
- **Recap:** `WhatMoved` has `hubHref` only; all three hosts have `collection.slug ?? collection.id` in scope — a `resultsHref` prop is trivially constructible.
- **Session lifecycle:** `sort_results` has **no sessionId** (results materialize from collection+curator preferences across sessions); `finalizeResult` can only complete *the curator's currently open session*, resolved at finalize time.
- **Copy sites:** enumerated below per string; `roundCopy.ts` centralizes compare name/explainer/subline and is shared by hub + walkthrough.

## Changes

### A. Results images — the MUST (purses-21x5.1)

1. `shared-results/[token]/page.tsx` fetches covers (`PhotoController.findCoverPhotosByItemIds`, same pattern as the other results surfaces) and passes `heroPhotoUrl` to its `ItemCard`s.
2. `RerankPanel` reorder rows: fallback becomes the item's initial letter (same treatment as view mode — one absence language everywhere).
3. A named test per surface pins that the cover URL is *passed* (the guarantee is wiring, not pixels): draft standing, snapshot view mode, snapshot reorder mode, shared token page.

### B. Per-sort progress on the session hub (and the workspace card)

On the session hub (`/sort/[sessionNumber]`), each round card gains a progress line, derived server-side from data the page already fetches (plus `items` count):

- **Triage card:** "38 of 100 sorted by feel" — decided = curator preference rows + set-aside dispositions; total = items.
- **Usage card:** "41 answered" — `deriveUsage(curatorEvents, rankedItemIds).size` (0 → "Not started yet" is machine-voice; use **"None answered yet"**… actually: omit the line entirely at 0 — absence is quieter than a zero).
- **Compare card:** qualitative only (owner-approved framing): mean/coverage of the persisted `confidence` field buckets to **"Not started yet"→(omit)** / **"Your order is taking shape."** / **"Your order is nearly settled."** — exact thresholds are an implementation detail pinned by unit tests, not copy that shifts.
- All three lines are plain text (`text-sm text-ink-soft`), no bars, no percentages (TONE; the amendment sanctions orientation, not KPI grids).
- **Workspace "Keep sorting" card** (resolves purses-1xbp.1): gains "62 still to sort" meta — remaining = items − (preferences + set-aside) for the curator; omit at 0 remaining. Requires the workspace page to fetch the two counts (bounded queries, same repos).
- `SessionAnalytics` keeps its qualitative tier-presence role; its `<h3>` "Where things stand" renames per §D.

### C. The ranking after every round

1. `WhatMoved` gains `resultsHref: string`; after "Back to your sort" it renders **"See your ranking so far"** → `/collections/[slugOrId]/results`. All three hosts pass it (slug already in scope). Link order: ranking first, then back-to-sort (the ranking is the payoff; back is the escape).
2. `SeeResultsCard`'s label "Show me what I love" → **"See results"** (§D) — the hub's permanent door.

### D. Language sweep + first-order amendments (owner-signed)

**Code (each with its test updates):**
| Site | Change |
|---|---|
| `roundCopy.ts` compare name + explainer + `COMPARE_SUBLINE` | name **"Which would you reach for first?"**; explainer **"Two side by side — which would you reach for first?"**; subline **"Tap the one you'd reach for. Tie or skip whenever you like."** |
| `compare/page.tsx` h1, `WelcomeCompare.tsx` h1 | **"Which would you reach for first?"** |
| `SortHelpDialog.tsx` compare dd | **"Puts pieces in order by what you'd reach for first."** |
| `SeeResultsCard.tsx` | **"See results"** |
| `results/page.tsx` h1, `WelcomeStanding.tsx` h1, `SessionAnalytics` h3 | **"Your ranking so far"** |
| Walkthrough/beats/roundCopy/compare/WalkthroughShell/SessionAnalytics tests | assertions updated to the new strings |

**PRODUCT.md (exact approved wording):**
- Principle 1 appends: *"Deciding stays one-at-a-time; the one sanctioned exception is the orientation dashboard — progress and the current ranking, each item shown with its photo — because knowing where you are is part of the gentleness, not a violation of it."*
- Anti-references bullet: "busy enterprise dashboards (KPI tiles, everything-at-once)" → *"busy enterprise dashboards (KPI tiles, everything-at-once — the sort orientation dashboard is the one deliberate exception: progress and the ranking, never KPI grids)"*
- Principle 5 appends: *"Rankings and results always show each item's photo."*
- L21 prose + L43: `"which do you love more?"` → `"which would you reach for first?"` (both occurrences).

**TONE.md L31:** `Ask "Which do you love more?"` → `Ask "Which would you reach for first?"` (rest of the line unchanged).

**Wireframe-only strings** ("pick a mood", "Get acquainted"): folded into the standing wireframe-sync bead (purses-xnp8), not this branch — the wireframes are the owner's documents.

### E. Sessions as invisible bookkeeping

`finalizeResult` (service level, inside the existing transaction boundary if any): after finalizing, resolve the curator's open (active|paused) session for that collection and, if one exists, mark it `completed` (un-deadening the status). No UI change; history/"Earlier passes" naturally gains completed rows. A DB-tier test pins: finalize with an open session → session completed; finalize with none → no-op, no error. (The finalize ROUTE passes curatorId/collection context already via the result row.)

## Testing

- Unit/jsdom: progress-line derivations (fractions, omission at 0, confidence bucketing thresholds); WhatMoved `resultsHref` rendering + order; copy assertions per §D table; RerankPanel fallback glyph; workspace card meta.
- DB-tier (`npm run test:db`): finalize-completes-session both branches; shared-results covers fetch crossing the real photo repo (extend the existing route/DB test if one covers the token page).
- e2e (tablet): extend `results.spec.ts` or the walkthrough spec ONLY where strings they pin changed (grep "love more", "Show me what I love", "Where things stand" in e2e first — the walkthrough spec pins compare copy); one new assertion in the sort-session journey: recap shows "See your ranking so far". Phone run not required (no viewport-sensitive change).
- Gates: full set + `auth:verify` not needed (no auth surface).

## Out of scope

- Phase 2 (URL collapse) — next spec, approved in principle.
- Wireframe doc edits (purses-xnp8). The saved-results index + Decide consolidation (purses-21x5 remainder).
