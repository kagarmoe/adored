# Epic S follow-up — Cross-tier hand-order (purses-9v1f.1)

**Date:** 2026-07-11 · **Bead:** purses-9v1f.1 (child of purses-9v1f) · **Origin:** Epic S review F-UX-I2 adjudication (deferred cross-tier reorder).

## Problem

Epic S shipped hand-order (`RerankPanel`) scoped to the **loved** tier only: a user can reorder loved
items but cannot move an item across the loved↔onward boundary by hand. The bead: wire `manual_bucket`
(already a column) via drag/move between tiers so a user can promote an Onward item into the loved
ranking, or set a loved item to rest in Onward — **by hand**.

## What already exists (no change needed)

The **entire read path** already honors a manual bucket override:

- `sort_result_items.manual_bucket` column exists (`schema.ts:374`, nullable text, `RankBucket`).
- `effectiveBucket(ri) = manualBucket ?? computedBucket` (`src/lib/results-buckets.ts:14`) is the single
  source of truth. `partitionRanked` splits loved (`top|high|medium`) vs onward (`low`) on it.
- `RankedResults` renders the tier badge from `effectiveBucket`, so a re-bucketed item already lands in
  the right section with the right badge on `router.refresh()`.
- The DELETE reset already NULLs `manual_bucket` (`clearManualOverridesByResult`).
- Live Decide/Standing is intentionally decoupled (`deriveStanding` hard-codes `manualBucket: null`) —
  **manual_bucket is a draft-result concept only; the Standing page needs no change.**
- The single-item `UpdateResultItemSchema` + `setManualOverride` already write `manualBucket`.

## The gap (the whole change)

Only the **bulk reorder write path + the reorder UI** are missing cross-tier support:

1. **Schema** — `ReorderResultItemsSchema` (`src/server/api/result-items.ts`) accepts only `{ rid,
   manualRank }` per entry. Add **required-nullable** `manualBucket: z.enum(["top","high","medium",
   "low"]).nullable()` (NOT `.optional()` — see review R4) so every entry carries value-or-null. The
   **positional single-divider client model (below) is R2's real fix** — it makes `manualRank` and zone
   agree by construction, so the client cannot emit a non-monotonic payload. The optional server-side
   monotonic assert is **deferred** (`ponytail:` — the UI cannot produce the bad state, and a hand-crafted
   non-monotonic payload only reshuffles on reload, a display quirk not data loss; upgrade path: a
   service-level effective-bucket monotonic assert if a non-UI caller ever writes this route).
2. **Service** — `SortResultService.reorderResultItems` writes only `{ manualRank }` per row. Widen the
   `order` param to `{ rid; manualRank; manualBucket: RankBucket | null }` and write
   `itemRepo.update(rid, { manualRank, manualBucket: manualBucket ?? null })` (the `?? null` coalesce so
   an undefined can never skip the column and strand a stale override — review R4). Repo `update` already
   accepts it. In-tx draft-lock + foreign-rid 404 guards unchanged.
3. **Page** — `rerankRows` is built from `loved` only. Build it from **`[...loved, ...onward]`** and give
   `RerankRow` its `computedBucket` so the client knows each row's computed zone and can compute the
   target `manualBucket` on save. Pass the loved/onward split point so the panel seeds the sentinel.
4. **`RerankPanel`** — render one ordered `<ol>` = `[…loved rows, SENTINEL <li>, …onward rows]`. The
   sentinel is a **real, addressable boundary element** (review R1), not a hairline. Move-up/down and drag
   move a row across the sentinel to cross zones; Onward rows are no longer read-only in reorder mode.

## Model — single sentinel divider, positional zone (review R1 + R2)

The reorder surface is **one ordered sequence** containing the rows **and a sentinel boundary element**:

```
[ lovedRow, lovedRow, …, ⟦SENTINEL "Onward"⟧, onwardRow, onwardRow, … ]
```

**Zone is derived purely from position relative to the sentinel** — never stored per-row. A row before the
sentinel is loved; a row after it is onward. This makes `manualRank` (position) and `targetZone` (side of
sentinel) two views of the *same* single array, so they can never disagree — the sequence is monotonic by
construction for both drag and button, closing the silent-reshuffle-on-reload gap (R2).

On **save**, walk the sequence; for each **row** (skip the sentinel) in order, let `i` be its 0-based index
among rows and `onward` = it sits after the sentinel:

- `manualRank = i + 1` (1-indexed, spans both zones; loved ranks always precede onward ranks → monotonic).
- `computedZone = isOnward(computedBucket) ? onward : loved`.
- **`manualBucket = (onward === (computedZone===onward)) ? null : (onward ? "low" : "medium")`** — i.e.
  `null` when the row is on its computed side (badge preserved); `"low"` when hand-moved to Onward;
  `"medium"` (a neutral loved bucket, not a fabricated top/high) when hand-promoted to loved.

Every save sends `manualBucket` (value **or** explicit null) for **every** row, so the overlay is fully
described and a stale override never lingers (R4). The page reconstructs identically: sort by
`manualRank ?? computedRank`, then `partitionRanked` by `effectiveBucket`.

## UX (TONE: neutral reorder, no demotion language — decided)

- One `<ol aria-label="Put in order by hand">`. The **sentinel is an `<li>`** (valid inside `<ol>`) with a
  visible **"Onward"** label and an accessible name — it is the AT-perceivable boundary, not a decorative
  line (R1, R3). Existing forward framing only — no "demote"/"let go"/"remove" words, no confirm friction.
- **Programmatic group membership (R3):** each row carries a visually-hidden zone span ("In your ranking" /
  "Onward") reflecting its current side, so a screen-reader user perceives membership on static navigation,
  not only via the transient move announcement.
- **Move-up / move-down** move a row by swapping with its adjacent sequence element — **including the
  sentinel**. Swapping a row past the sentinel crosses zones (this is how the keyboard/AT path crosses, and
  how an **empty** zone is reachable — the sentinel can sit at either end). A row's ↑ is disabled only at
  sequence top; ↓ only at sequence bottom. The sentinel itself is not user-movable.
- **Drag** a row above/below the sentinel to re-bucket (PRODUCT.md sanctions drag; no swiping). A drop's
  zone is read from the final position relative to the sentinel (positional, R2).
- `role=status` announcement names the destination section on a cross, e.g. *"Moved {name} to Onward,
  position N."* / *"Moved {name} into your ranking, position N."* (count-free; N is the AT position
  necessity Epic S's announcement already exempts).
- ≥44px targets + reduced-motion: unchanged from the shipped panel.

## Testing

- **DB integration** (`src/lib/db/sort-results-rerank.integration.test.ts` sibling): a reorder batch
  carrying `manualBucket` writes both columns in one transaction; **a batch that omits→null clears a prior
  override** (R4 boundary); a finalized parent still 409s; foreign rid still 404s. One un-mocked crossing.
- **Component** (`RerankPanel.test.tsx`): (a) a button move that crosses the sentinel flips the row's side
  and the save payload carries the target `manualBucket` (low / medium / null per the rule); (b) drag
  across the sentinel does the same in jsdom; (c) **empty-zone reachability** — with all rows loved, the
  bottom row's ↓ crosses it into an empty Onward (sentinel end case); (d) the sentinel `<li>` has its
  accessible "Onward" name and each row exposes its current zone (R1, R3).
- **e2e** (`results-rerank.spec.ts`, already in ci.yml `results` area): extend — promote the Onward item
  (Item 3) into loved by move-up across the sentinel; assert the PATCH persists and after reload Item 3
  renders in the loved ranking (3 loved rows now), and the announcement named the destination. This is the
  cross-tier journey the loved-only assertion previously pinned as excluded.
- **Screenshots**: the reorder surface now showing both groups + the sentinel boundary (light+dark). No new
  seed — `seedSortScenario` already buckets Item 3 to low (Onward).

## Review folded (adversarial-review, 2026-07-11)

Four-lens spec review (system-design / ux-a11y / data-persistence / craftsman-qa), each finding
adversarially verified. Confirmed & folded above: **R1** (blocker) sentinel divider must be a real
addressable element — buttons cross it, empty zones reachable; **R2** (major) positional single-divider
model + server-side monotonic refine kills silent reshuffle-on-reload; **R3** (major) programmatic group
membership (sentinel accessible name + per-row zone span) for WCAG 1.3.1; **R4** (minor ×2) required-nullable
`manualBucket` + `?? null` coalesce so an omitted field can't strand a stale override. No blockers remain.

## Out of scope / non-goals

- No migration (column exists). No repo change (`update` is generic). No Standing-page change.
- No new bucket granularity in the UI — cross-tier is binary loved↔onward; within-loved top/high/medium
  distinction stays computed (badges), not hand-editable (YAGNI; not asked).
- Finalized results stay immutable (existing 409).
