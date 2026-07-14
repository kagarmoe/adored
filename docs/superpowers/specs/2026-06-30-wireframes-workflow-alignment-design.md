# Design: Adored workflow overhaul + design-system refresh

- **Date:** 2026-06-30
- **Branch:** `design/wireframes-workflow-alignment`
- **Status:** Draft — pending focused re-review + user approval
- **Authorities (first-order, unchanged):** [`PRODUCT.md`](../../../PRODUCT.md),
  [`TONE.md`](../../../TONE.md), [`DESIGN.md`](../../../DESIGN.md). Where any design source and
  `TONE.md` disagree, `TONE.md` wins.

## 1. Two design sources, one effort

The user produced two artifacts; they are complementary, not rival:

- **Tablet wireframes** — the **workflow / layout** intent: timed rounds, a fast incremental
  ranking, a unified Decide surface, Build/Sort/Decide modes, the forward-framed story.
- **Design-system handoff** (`design_handoff_adored_*`, parts 1–2) — the **visual system**:
  eight hi-fi screens (light + dark), exact tokens matching `globals.css`, and **one net-new
  component, `TierBadge`**. It styles the screens that overlap today's app; the
  overhaul-specific surfaces (sort hub / round + ring, Compare, Decide, Standing) take their
  **layout from the wireframes**, rendered in the **handoff's tokens + components**.

This is an **overhaul of the workflow** delivered in the **refreshed visual system** — not a
rebuild, and not a visual-only refresh. Confirmed with the user 2026-06-30.

## 2. Decisions (settled with the user)

| # | Decision | Outcome |
|---|---|---|
| A | Sort shape | **Timed rounds.** Hub recommends a round → one item at a time → "what moved" → back. A **round timer** (the violet ring) lives on the **round surface** (not the per-item triage card). It is **kept** — built to its a11y floor (§7). |
| B | Ranking | **Binary-insertion, scoped to Love + Like only.** Incremental, most-loved-first, **stop-anytime**, a handful per round; finish on buckets alone is valid. Maybe/Onward stay buckets, never ranked. **Replace the Elo `ScoringService`** — Elo is too slow. |
| C | Decide surface | **Unify** `/results`, set-aside, finalize into one **Decide** surface: Standing · Put in order · Set aside · Finalize. **Not** called a "dashboard" (PRODUCT disowns the register). Sharing reachable from Finalize. |
| D | Story | **Optional story, asked _forward_** ("Where will it go next?"), **kept after** the choice — never solicited before a decision. Length-capped + escaped. Voice deferred. |
| E | Workspace modes | **Build / Sort / Decide chips** as primary nav; keep "one dominant action" underneath. Chips must not become a *third* path to surfaces the adaptive panel already routes to. |
| F | Repo-only features | **Keep all** (archive/restore/purge + audit, sharing, manual-rank overlay + reset, supersede, photo infra). Restyle to the handoff; cut nothing. |
| Pool | Photo pool | **Keep the staging workflow**, restyled to the handoff's "Photos" screen ("dump fast, group later or never"; select → "Group into an item" / "Move to…"). Tap-select, no swipe. |
| Visual | Design system | Recreate the **8 handoff screens** (both themes, AA, reduced-motion) using existing `src/components/ui/*` + tokens; add **`TierBadge`**. No parallel styling system. |

## 3. Epic decomposition (foundation-first)

Each epic is independently shippable and gets its **own** spec → adversarial-review →
writing-plans → execute → review → verify → finish cycle. Sequence honors the user's
foundation-first choice: the riskiest backend (ranking) is Epic 0.

### Epic 0 · Binary-insertion ranking engine (backend) — FIRST
Replace Elo with binary insertion over **Love + Like**. Built to keep the property that makes
today's ranking safe: **the order is recomputed from the append-only `decisionEventsTable`,
never stored as mutable progress.**

- **Model:** comparison decisions append to the event log; the curator's Love+Like order is a
  **deterministic re-execution of the insertion algorithm** over that log — *not* a commutative
  scalar fold like `computePreferences`. The sparse comparison edges form a *partial* order with
  many linear extensions, so the total order is pinned only by replaying insertion in a fixed
  sequence. Binary insertion decides **which pair to ask next** (read from the materialized
  order, not re-folded per comparison). `orderRank` is the materialized output, not an
  incrementally-mutated window — a round can end at any comparison; a not-yet-fully-placed item
  is simply still unplaced.
- **Determinism inputs (load-bearing):** canonical insertion sequence = items ordered by
  `(createdAt, id)`; a fixed midpoint tie-break (`floor`) for even-length sublists. Without
  these the same event set yields different orders.
- **Contradictions:** for a re-queried pair, **the last comparison by `(createdAt, id)` wins**.
  Replay applies only the comparisons on each insertion's search path; historical edges off the
  path are treated as stale (superseded by the user's latest on-path answers), never silently
  enforced against them. A contradictory/cyclic sequence is a named test case (§7).
- **Bound:** worst-case comparisons to place one item into a list of n is **`ceil(log2(n+1))`**.
- **Tie / Skip:** *Tie* places adjacent (~equal); *Skip* leaves the item unplaced to resurface.
- **Scope:** Love + Like only; Maybe/Onward keep their bucket, never enter the order. "Most
  loved" = order position #1. A Love/Like item the user **triaged but never ranked still
  appears** in results — unranked, at the end of its tier (decision F: cut nothing; affirmation,
  not a silent drop).
- **Persistence:** **dense integer `orderRank`**, scoped `(collectionId, curatorId)`, written by
  **delete-all-then-insert per curator on each recompute** (mirrors the existing
  `recalculatePreferences` rewrite-all). No incremental insert ⇒ no sparse/fractional ranks, no
  renormalization, no deferrable-constraint problem. "**placed ⟺ has orderRank**" defined and
  DB-enforced. Pivot lookups read the materialized order (single indexed read), never a
  per-comparison re-fold.
- **Concurrency:** the idempotency key (below) covers **retries only**. To stop two tabs racing a
  recompute from leaving a stale materialized order that a concurrent Finalize could snapshot,
  **row-lock `(collectionId, curatorId)` (or the session row) for the recompute** — append +
  recompute already run in one transaction as today.
- **Idempotency:** a **client-supplied key** on `POST …/decisions`, deduped by a **partial unique
  index** `(sessionId, client_key) WHERE client_key IS NOT NULL` (nullable for legacy rows;
  hand-authored like `0009`); a duplicate returns the prior event **idempotently**, not an error.
  The relation-based fold is naturally idempotent under a repeated *consistent* comparison, so
  the key is hardening, not the sole correctness guard.
- **Finalize rewire:** `sortResultMaterialization` sorts by `pref.score` today; in the **same
  epic that retires score** it must (a) read the new `orderRank`, and (b) source `computedBucket`
  from the Love/Like/Maybe/Onward tier (the `TierBadge` ramp), since `pref.rankBucket` is
  retired. Keep `preferences.score`/`confidence` **NOT NULL and supplied** until Finalize is
  fully off score (a null score NaN-corrupts the existing comparator); drop them in a later
  cleanup bead.
- **Migration:** **clean reset** of ordering (pre-launch, trivial volume), **forward-only**.
  Existing **finalized** results are self-contained snapshots (`cloneItemsFrom`) — unaffected.
  **Draft** sort results computed under Elo are discarded (or re-materialized at Finalize) so
  none snapshots a dead order.
- **Out of scope:** any UI; the timer.

### Epic 1 · Visual foundations + `TierBadge`
- Add **`TierBadge`** (`src/components/ui/TierBadge.tsx`, drop-in source in the handoff README:
  glyphs ●◕◑○ so the tier ramp survives greyscale — DESIGN's "colour is never the sole signal").
- Refresh the **standalone screens** to handoff fidelity: **Login, Collections, Members,
  Profile** (both themes, AA, reduced-motion). Isolated frontend; may run alongside Epic 0.

### Epic 2 · Story (forward-framed) + Item detail refresh
- Nullable `itemsTable.story`; item detail leads with a quiet **"Tell its story"** invite, the
  keepsake prompt **"Where will it go next?"** ("kept after the choice — never asked before
  it"), details as chips; nameless item shows a gentle **"Add a name"**, never "Incomplete"/%.
- **Length cap (≤ 2000 chars) + escape** at the boundary; render as text, **never**
  `dangerouslySetInnerHTML`. Refresh `ItemDetail` to the handoff.

### Epic 3 · Workspace modes + Pool refresh
- **Build / Sort / Decide chips**; adaptive "one dominant action" underneath; chips route to
  existing surfaces, not a duplicate path.
- Refresh the pool to the handoff's **"Photos"** screen (staging workflow unchanged: select →
  "Group into an item" / "Move to…"). Tap-select, no swipe.

### Epic 4 · Sort rounds + ring timer + Compare round
- The round loop (hub recommends → one at a time → "what moved" → back); **session stays the
  durable container** (one active/paused per collection+curator); a round is an ephemeral
  time-box inside it. The **Compare round** is the "put in order" activity consuming Epic 0.
- **"What moved"** is derived from **server-time** decision-event timestamps within the round
  window (no rounds table); explicitly **best-effort** (client round boundaries can be fuzzy);
  built behind an **injectable clock** so it is deterministically testable.
- **Round-length preference** lives in **`localStorage`** (device-local UI pref; no DB table —
  avoids the owner-not-a-member stranding trap).
- **Tie / Skip** are **visible, gently-worded** compare controls (≥44px), never a forced binary.
- **Timer a11y floor (§7).**
- **Out of scope:** the Useful swipe round.

### Epic 5 · Unified Decide + Results refresh
- One **Decide** surface: **Standing** (live, derived bucket counts + most-loved, framed as
  affirmation — *not* a metrics panel) · **Put in order** (an entry into the Epic 0/4 ranking) ·
  **Set aside** (today's shelf folded in) · **Finalize** (name + lock; sharing reachable here).
- **Finalize source-of-truth:** the **live order is canonical**; Finalize snapshots it into
  `sortResultItems`; state explicitly how the kept **manual-rank overlay** applies to the
  snapshot so a hand-tweak is not silently dropped.
- Refresh **Results** to the handoff (hero "What you love most", `TierBadge` rows, "Onward —
  where these go next"). Keep `/results` deep-links + share routes resolving after the fold-in.

## 4. Consolidated data-model changes

- `itemsTable.story` — nullable text, ≤ 2000 at the boundary (Epic 2).
- Ranking (Epic 0): **dense** `orderRank` scoped `(collectionId, curatorId)`, delete-all-then-
  insert per recompute; partial unique idempotency index `(sessionId, client_key)` on
  `decisionEventsTable`; `preferences.score/confidence` stay **NOT NULL + supplied** until the
  Finalize cutover, then dropped (cleanup bead). No incremental-insert / sparse-rank machinery.
- Round-length: **`localStorage`**, no schema.
- No schema for "what moved" (derived) or Decide (composition over existing
  preferences/dispositions/results).

## 5. Cross-cutting constraints

- **Visual:** recreate the 8 handoff screens with existing `src/components/ui/*` + tokens; add
  `TierBadge`; **no parallel styling system**. Both themes AA; honor `prefers-reduced-motion`.
- **Copy is person-side** (TONE): no counts / denominators / "N to go", no "dashboard", no
  shaming empty states; paused/benign uses `content-mid`, never amber.
- **Tablet-first, tap-first, no swiping** (drag where it helps); targets ≥ 44px.
- **Phone coverage:** every `src/app/**/page.tsx` route must have a phone layout contract in
  [`2026-07-14-page-phone-layout-coverage.md`](2026-07-14-page-phone-layout-coverage.md) before
  page-level implementation proceeds.
- **Keep all repo-only features (F)** — restyle, don't regress.
- **UI PRs ship light + dark screenshots**; run `/sync-docs` + `/graphify --update` before PRs.
- Branch → PR → squash-merge; never commit to `main`.

## 6. Out of scope (wireframe-marked "later")

Useful swipe round; ad-hoc add-items-mid-sort placement; a public-shared-results **redesign**
(keep what's built); **voice** story capture.

## 7. Testing & accessibility floor

**Testing (per CLAUDE.md + the override):** TDD; YAGNI does not apply to tests; a test counts
only if it runs in CI; DB-backed tests behind `RUN_DB_TESTS=1` in the `db-tests` job; ≥1
real-layers-un-mocked test per epic. **Named per-epic obligations** (the spec must not leave
these as prose risks):

- **Epic 0 (DB-backed):** the `ceil(log2(n+1))` bound proven across a range of n **and**
  adversarial answer sequences (monotone-up, monotone-down, alternating); a **contradictory/cyclic
  sequence** yields a deterministic order consistent with the latest on-path answers (no silent
  enforcement of stale off-path edges); placed ⟺ `orderRank`; Maybe/Onward never enter the order
  but a **never-ranked Love/Like item still materializes** (unranked, at its tier's end — not
  dropped); per-curator isolation; Tie adjacent; Skip leaves unplaced + resurfaces; **retry
  idempotency** (duplicate key → prior event, no double-fold) **and** **concurrent distinct
  decisions** don't leave a stale materialized order (recompute row-lock); the **clean-reset
  migration** (drafts handled, forward-only); edges **n=0** and **n=1**.
- **Epic 2:** story max-length rejection; safe render (no XSS); empty story renders without the
  keepsake quote.
- **Epic 4:** injectable clock; "what moved" boundary (decision just-in / just-out / on the
  edge); fake-timer expiry→summary + end-state; **reduced-motion** (`matchMedia`) suppresses
  animation while the expiry callback still fires; round-expiry vs queue-empty both terminate;
  a round never creates a 2nd session or strands a paused one.
- **Epic 5:** Standing most-loved == `orderRank` #1; both Put-in-order entry points share one
  derivation; `/results` deep-links + shares resolve post-fold-in; a finalized order is frozen
  against later insertion.

**Accessibility floor for the round timer (WCAG 2.1 AA):** because timing is **not essential**
to a contemplative tool, the round must offer an **adjustable / "no timer" path** (2.2.1); the
no-digits ring needs a **text alternative** (1.1.1); the end state must **not** rely on
colour alone (violet→gold needs a non-colour cue, 1.4.1); a defined **reduced-motion**
rendering (no animating ring → an instant/static cue, never *no* signal). Plus the system-wide
floor: keyboard-operable (pool tile-select, compare choices, chips), visible focus, `aria-live`
for "what moved" / timer state / Standing counts, real labels.

## 8. Open items for Epic 0's own spec

**Mechanism detail to resolve in Epic 0's spec** (the *rules* are fixed in §3): the exact lock
scope (curator-row vs session-row) and the recompute transaction SQL; the `client_key` column +
partial-index migration; the Finalize `computedBucket` mapping wiring; whether Elo-era drafts are
discarded vs re-materialized at Finalize.

**Fixed inputs (not open — settled by the re-review):** recompute-from-log as a *deterministic
insertion replay* (not a scalar fold); canonical sequence `(createdAt, id)` + `floor` midpoint;
last-comparison-wins contradiction rule with off-path edges treated as stale; **dense** `orderRank`
via delete-all-then-insert; row-locked recompute; `score`/`confidence` kept NOT NULL + supplied
until the Finalize cutover; never-ranked Love/Like items still appear; clean **forward-only** reset;
`ceil(log2(n+1))`.

## 9. Next step

Focused re-review of this revised spec (the scope changed materially), then user approval, then
**Epic 0 → `writing-plans`**. Subsequent epics get their own spec → review → plan cycles in
sequence.
