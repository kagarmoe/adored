# Sort orientation Phase 1 — design

**Date:** 2026-07-17 · **Epic:** purses-g9vg · **Branch:** feat/sort-orientation
**Rev 2** — adversarial spec review folded (UX; Architect+QA). **Authority:** proposal rev 2 (merged #358) + owner decisions 2026-07-17: compare question = **"Which would you reach for first?"**; results stay plain **"Results"**; Part 1b amendments approved as drafted; Phases 1 AND 2 approved (this spec is Phase 1; Phase 2 gets its own spec after).

## Verified facts (fresh fact-check)

- **Images:** every results surface passes an optional cover URL into `CardImage`, which falls back to the item's initial letter — EXCEPT (a) `shared-results/[token]/page.tsx` never fetches covers at all (photos never render there), and (b) `RerankPanel`'s reorder rows fall back to a blank `aria-hidden` span, not the initial glyph. The MUST therefore means: fetch covers on the shared page; unify the reorder fallback.
- **Progress inputs:** no aggregate queries exist; the session hub page already fetches `preferences`, curator decisions, and `dispositions`. Triage coverage = preference rows (+ set-aside dispositions) vs `items.length`; usage = `deriveUsage(events, itemIds).size` (already server-computed for the usage page); compare: `CollectionPreferenceItem.confidence` is persisted and currently unsurfaced.
- **Recap:** `WhatMoved` has `hubHref` only; all three hosts have `collection.slug ?? collection.id` in scope — a `resultsHref` prop is trivially constructible.
- **Session lifecycle:** `sort_results` has **no sessionId** (results materialize from collection+curator preferences across sessions); `finalizeResult` can only complete *the curator's currently open session*, resolved at finalize time.
- **Copy sites:** enumerated below per string; `roundCopy.ts` centralizes compare name/explainer/subline and is shared by hub + walkthrough.

## Changes

### A. Results images — the MUST (purses-21x5.1)

**Review finding (BLOCKING, folded):** the photo byte route (`/api/photo-files/...` → `serveItemPhotoFile`) 401s without a session, and the shared page is deliberately anonymous — wiring cover URLs alone would render letter-fallbacks for every anonymous viewer. The MUST therefore includes a new route:

1. **New public route `GET /api/shared-results/[token]/photos/[photoId]`**: authorizes by the SHARE (token → active share → finalized result), verifies the photo's item belongs to that result's ranked items (no reaching unrelated collection photos through a share token), then delegates byte-serving to the existing `servePhotoFile` (width allowlist, ETag, caching as-is). Collapses every failure to the same 404 (existing shared-results error posture). Proxy matcher already admits `shared-results(?:/|$)` paths — verify the API path matches it (it starts `api/shared-results`, NOT `shared-results` — the matcher needs `api/shared-results(?:/|$)` added, tests updated like #354's).
2. `shared-results/[token]/page.tsx` fetches covers and builds URLs pointing at the NEW route; passes `heroPhotoUrl` to its `ItemCard`s.
3. `RerankPanel` reorder rows: fallback becomes the item's initial letter (one absence language everywhere).
4. Tests: wiring pins per surface (draft standing, snapshot view, snapshot reorder) PLUS the un-mocked crossing the testing principle demands: a DB-tier route test hitting the new photo route with NO session — 200 with image bytes for a shared photo, 404 for a photo outside the shared result, 404 for a revoked share. e2e: `shared-results.spec.ts` (anonymous context) asserts at least one rendered item image responds 200 (fetch the img src in-page).
5. docs/API.md gains the new route row (public, token) — sync-docs at PR time.

### B. Per-sort progress on the session hub (and the workspace card)

On the session hub (`/sort/[sessionNumber]`), each round card gains a progress line, derived server-side from data the page already fetches (plus `items` count):

- **Triage card:** "38 of 100 sorted by feel" — decided = curator preference rows + set-aside dispositions (mutually exclusive by construction — verified); total = items. **Omit the line entirely at 0 decided** (same rule as the others; never render "0 of 100" — TONE).
- **Usage card:** "41 answered" — `deriveUsage(curatorEvents, rankedItemIds).size`; omit the line entirely at 0 (absence is quieter than a zero).
- **Compare card:** qualitative only: buckets of the persisted `confidence` field → (omit at none) / **"Your ranking is taking shape."** / **"Your ranking is nearly settled."** ("ranking", not "order" — review: 'order' echoes commerce status copy, and it unifies the vocabulary). Thresholds are implementation details; unit tests pin the thresholds and this exact stability contract: **more comparisons on already-compared items never demote the message; a newly-compared item MAY reset 'nearly settled' to 'taking shape'** — that is real new information (the ranking genuinely is less settled), not noise, and a test documents it as deliberate.
- All three lines are plain text (`text-sm text-ink-soft`), no bars, no percentages (TONE; the amendment sanctions orientation, not KPI grids).
- **Workspace "Keep sorting" card** (resolves purses-1xbp.1): gains **"38 of 100 sorted so far"** — accomplished-count framing (review: "62 still to sort" mirrors TONE's own forbidden "N still undecided" exemplar; the wireframe's phrasing loses to the first-order contract). Omit at 0 decided. The total MUST be a real count — never `itemPreview.length` (bounded to 12).
- `SessionAnalytics` keeps its qualitative tier-presence role AND **keeps its "Where things stand" heading** (review: renaming a tier-presence panel to "Your ranking so far" would mislabel it as an ordered ranking — the string is reserved for surfaces that ARE rankings).

### C. The ranking after every round

1. `WhatMoved` gains `resultsHref: string`; it renders **"See your ranking so far"** → `/collections/[slugOrId]/results`, then "Back to your sort". All three hosts pass it (slug in scope). The PRODUCT amendment sentence is extended one clause to cover this door explicitly (below) — review flagged that the approved wording sanctioned the dashboard's content, not the recap-frequency nudge; the extension is flagged to the owner in the PR body as a wording delta on an approved amendment.
2. `SeeResultsCard`'s label "Show me what I love" → **"See results"** (§D) — the hub's permanent door.

### D. Language sweep + first-order amendments (owner-signed)

**Code (each with its test updates):**
| Site | Change |
|---|---|
| `roundCopy.ts` compare name + explainer + `COMPARE_SUBLINE` | name **"Which would you reach for first?"**; explainer **"Two side by side — which would you reach for first?"**; subline **"Tap the one you'd reach for. Tie or skip whenever you like."** |
| `compare/page.tsx` h1, `WelcomeCompare.tsx` h1 | **"Which would you reach for first?"** |
| `SortHelpDialog.tsx` compare dd | **"Puts pieces in order by what you'd reach for first."** |
| `SeeResultsCard.tsx` | **"See results"** |
| `results/page.tsx` h1, `WelcomeStanding.tsx` h1 (NOT SessionAnalytics — see §B) | **"Your ranking so far"** |
| Walkthrough/beats/roundCopy/compare/WalkthroughShell tests | assertions updated to the new strings |
| **e2e/compare.spec.ts** (3 hits), **e2e/sort-session.spec.ts** (compare h1 + 4× "Show me what I love"), **e2e/welcome-walkthrough.spec.ts** ("Where things stand"), **e2e/screenshots/capture.ts** (compare h1 waitFor + "Where things stand" waitFor) | assertions/waits updated — review found the spec's original sweep missed ALL of these (and its walkthrough-pins-compare claim was wrong) |

**Vocabulary note (deliberate, do not "fix"):** triage tiers stay Love/Like/Maybe/Onward and the finalized hero stays "What you love most" — only the compare QUESTION drops "love" (owner: the forced A/B framing was the violation, not the word).

**PRODUCT.md (exact approved wording):**
- Principle 1 appends: *"Deciding stays one-at-a-time; the one sanctioned exception is the orientation dashboard — progress, the current ranking, each item shown with its photo, and the quiet door to it at the end of each round — because knowing where you are is part of the gentleness, not a violation of it."* (the underlined clause "and the quiet door…" is the one delta from the approved draft — flagged for owner ratification in the PR)
- Anti-references bullet: "busy enterprise dashboards (KPI tiles, everything-at-once)" → *"busy enterprise dashboards (KPI tiles, everything-at-once — the sort orientation dashboard is the one deliberate exception: progress and the ranking, never KPI grids)"*
- Principle 5 appends: *"Rankings and results always show each item's photo."*
- L21 prose + L43: `"which do you love more?"` → `"which would you reach for first?"` (both occurrences).

**TONE.md L31:** `Ask "Which do you love more?"` → `Ask "Which would you reach for first?"` (rest of the line unchanged).

**Wireframe-only strings** ("pick a mood", "Get acquainted"): folded into the standing wireframe-sync bead (purses-xnp8), not this branch — the wireframes are the owner's documents.

### E. Sessions as invisible bookkeeping

- `finalizeResult`: **both writes in ONE `withTransaction`** (review: no transaction exists today and "if any" was a hedge — the finalize-update and the session-complete update commit or fail together). Resolve the curator's open (active|paused) session from the result row's collectionId+curatorId; mark `completed` if present; no-op if none.
- **Round pages guard the completed state** (review: today they don't check status, and the decision route's 409 surfaces NOTHING client-side — a user finalizing then tapping a round would be silently stranded): triage/usage/compare pages check `sortSession.status` server-side and `redirect()` to the session hub when the session is neither active nor paused. Cheapest fix, consistent with the pages' existing guards.
- The unwired `session_conflict` notice (pre-existing latent gap, now adjacent): filed as a bead, not fixed here.
- DB-tier tests: finalize+complete atomicity (both rows moved), finalize-with-no-open-session no-op, round-page guard (page-level test or the authz-enumeration pattern).

## Testing

- Unit/jsdom: progress-line derivations (fractions, omission at 0, confidence bucketing thresholds); WhatMoved `resultsHref` rendering + order; copy assertions per §D table; RerankPanel fallback glyph; workspace card meta.
- DB-tier (`npm run test:db`): finalize-completes-session both branches; shared-results covers fetch crossing the real photo repo (extend the existing route/DB test if one covers the token page).
- e2e (tablet): the four files named in the §D table updated; one new assertion in the sort-session journey (recap shows "See your ranking so far"); `shared-results.spec.ts` gains the anonymous image-bytes assertion (§A). Phone run not required (no viewport-sensitive change).
- Gates: full set + `auth:verify` not needed (no auth surface).

## Out of scope

- Phase 2 (URL collapse) — next spec, approved in principle.
- Wireframe doc edits (purses-xnp8). The saved-results index + Decide consolidation (purses-21x5 remainder).
