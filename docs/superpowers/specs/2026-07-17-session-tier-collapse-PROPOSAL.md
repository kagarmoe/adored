# PROPOSAL rev 2 (owner review): the sort hub as an orientation dashboard — and the language of sorting

**Date:** 2026-07-17 · **Beads:** purses-znkt.3 (reframed), purses-1xbp.1 (resolved by owner: progress counts are wanted) · **Status: awaiting owner approval of the specifics below.** Supersedes rev 1, which framed this as a URL-tier collapse; owner discussion reframed it around orientation.

## What the owner discussion established

1. **Sessions were never the unit of sorting.** A 100-item collection means many interleaved rounds of all three sort types over weeks — all supported today inside one open container. The URL/copy ("Sorting sessions", session numbers) misrepresents the model; that confusion is real (it misled the owner's own reading) and worth removing — but it's secondary.
2. **The real requirement is orientation.** At any moment mid-journey: *where am I, how much is left, and what does my ranking look like right now?* Results are visible after **every** round, never gated behind finalize.
3. **Lifecycle fact found during discussion:** nothing in the product ever sets a session to `completed` — the status is dead code. Sessions only become active, paused, or set-aside. The boundary rule below fixes this quietly, as bookkeeping.
4. **Language verdicts (owner):** "Pick your mood" mis-names the choice (it's picking a *sort*); "Get acquainted" is wrong for items the person owns and photographed; **"Which do you love more?" is a Sophie's-choice framing that violates the app's intention** — despite being enshrined in PRODUCT.md, which therefore needs a deliberate first-order amendment; "Show me what I love" loses to plain "Results" (accuracy wins), though it misses the one natural place for the brand word "adore"; "Where things stand" is unclear.

## Part 1 — The orientation dashboard (the substance)

The hub (`/collections/[id]/sort`) becomes the place that answers *where am I*:

- **Per-sort progress, derived from the durable decision log** (accurate across any interleaving, no session math):
  - Triage: **"38 of 100 sorted by feel"** — a plain fraction; owner ruled counts are orientation, not shaming (resolves purses-1xbp.1; the workspace "Keep sorting" card gains the same "62 still to sort" meta the wireframes drew).
  - Usage: **"41 answered"** (of the ranked set).
  - Compare: pairwise "done" is fuzzy — a gentle qualitative signal (the wireframes used a progress bar + an invitation, never a fraction): **"Your order is taking shape — a few more choices will settle it."** backed by the existing confidence metric.
- **The ranking after every round:** each round's recap ("Here's what moved") ends with **"See your ranking so far"** → the draft results page. One tap from every round-end to the living order. The hub carries the same link permanently.
- **Sessions become invisible bookkeeping.** Underneath: finalizing a result marks its session `completed` (un-deadening the status, giving analytics/history clean segments); set-aside abandons, as today; nothing closes on time — returning after a month resumes the same quiet container (TONE: no penalty for pausing). Nothing user-facing depends on session identity anymore: "Earlier passes" demotes or folds into the saved-results index (Decide epic), because the orientation surface is progress + ranking, not containers.

## Part 2 — The language of sorting (owner verdicts → proposed replacements)

Each string mapped to every surface it lives on. **Bold** items need your final word.

| Current | Where it lives | Proposed | Rationale |
|---|---|---|---|
| "pick a mood" / mood chips | wireframes only (Sort & Decide) | **"Pick your sort"**; chips name the sorts | It's a choice of sort, not mood (owner) |
| "Get acquainted" | wireframes only | drop entirely; triage's live question "How do you feel about this one?" already carries it | The person owns and photographed these items (owner) |
| **"Which do you love more?"** | compare page, SortHelpDialog, WelcomeCompare (walkthrough), **PRODUCT.md ×2, TONE.md ×1** | **"Which would you reach for first?"** (alt: "Which one calls to you today?") | Owner: Sophie's-choice violation. "Reach" is the wireframes' own mechanic verb; *first* is temporal, not verdictive — the unchosen isn't unloved, it's just not first today. Requires deliberate PRODUCT.md + TONE.md amendment — first-order, owner signs the exact wording |
| "Show me what I love" | SeeResultsCard | **"Results"** (card action: "See results") | Accuracy wins (owner). Reserved option: the finalized top tier is the one tasteful home for the brand word — e.g. **"The ones you adore"** — owner's call, not assumed |
| "Where things stand" | WelcomeStanding (walkthrough), results-page heading vicinity | **"Your ranking so far"** | Says what it is; matches the orientation frame |

Sweep note: `roundCopy.ts` centralizes some round strings — the implementation consolidates these there where sensible, so the next tone pass lands in one file.

## Part 3 — The URL collapse (demoted)

Route hygiene only, after Parts 1–2: `/sort` as the hub, rounds at `/sort/triage|usage|compare`, session auto-created/reused (`sessions_active_unique` guarantees one), old `/sort/[n]/…` URLs get guard-first permanent redirects (pattern established in #356). Real blast radius (routes, breadcrumbs, authz-enumeration, many e2e) — its own spec+review cycle. Can be declined independently without weakening Parts 1–2.

## Delivery, if approved

- **Phase 1 (Parts 1–2):** one epic — progress dashboard + recap→ranking link + copy sweep incl. the PRODUCT/TONE amendment (a commit you approve the wording of). Full spec → adversarial review → plan → build.
- **Phase 2 (Part 3):** optional, separate spec.

## Decisions needed from you

1. Compare question final wording: **"Which would you reach for first?"** — yes, or your preferred phrasing.
2. "The ones you adore" for the finalized top tier — use it, or keep tiers as they are.
3. Approve Phase 1 scope; Phase 2 go / defer / decline.
