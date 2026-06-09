# Sort Ranking Model Rework — Design

**Date:** 2026-06-09
**Issue:** purses-h02 (rework sort ranking model). Resolves purses-7lh (tier↔bucket
misalignment). Depends on purses-jo2 (✓ merged). Blocks purses-o93 (compare/triage UI redesign).

## Problem

Triage buckets and pairwise comparisons currently produce disconnected scores instead of two
resolutions of one ranking:

- **Tier↔bucket misalignment (purses-7lh).** Triage seeds scores at band *edges*
  (`{top:1.0, high:0.75, medium:0.5, low:0.25}`) while `getBucket` uses those same values as
  *lower bounds* (`>=0.75→top, >=0.5→high, >=0.25→medium`). A `high`/Like item (0.75) therefore
  buckets as `top`/Love — every tier reads one bucket too high when pairwise refinement is absent.
- **No cross-tier movement.** The interim jo2 fix kept two accumulators (a triage base plus a
  pairwise delta floored at `>=0`) and *added* them. The floor blocks any net-negative pairwise
  signal, so pairwise can never demote an item below its triage tier — incompatible with the
  product decision that strong, consistent comparisons may move an item across a tier boundary.

## Confirmed decisions

Product decisions (owner-confirmed 2026-06-02, reaffirmed 2026-06-09):

- Triage sets a coarse tier; pairwise refines order **and** may promote/demote across a tier
  boundary when evidence is strong and consistent.
- **Cross-tier override is symmetric across every boundary, including the Release boundary.**
  Strong pairwise evidence can rescue a Release item up into favorites *and* demote a favorite
  down into Release. All boundaries behave identically.
- Tie = no net swing. Skip = true no-op.
- Release is `low`; it is the letting-go set, segregated from ranked favorites in results data.

Approach decision (2026-06-09): **Approach A — minimal & affirmation-biased.** Seed at band
centers; keep asymmetric deltas (win `+0.1`, loss `-0.05`) so rising is easier than falling.

Vocabulary note: the user-facing labels Love/Like/Maybe/Release already map to the internal
`top/high/medium/low` values in the triage UI. Tiers are stored as free text (no `pgEnum`). **No
rename, schema change, or migration is required.**

## The model

A single continuous score in `[0, 1]`, computed in two order-independent passes over a curator's
decision events. Band boundaries (unchanged from today's `getBucket`):

```text
score   0 ────── 0.25 ────── 0.5 ────── 0.75 ────── 1.0
band   │ Release  │   Maybe   │   Like    │   Love    │
center │  0.125   │   0.375   │   0.625   │   0.875   │   ← triage seeds here (•)
                  └── ±0.125 headroom to each boundary ──┘
```

**Pass 1 — triage seeds the base score at its band center:**

| Tier (label) | Internal | Seed (center) |
|---|---|---|
| Love | `top` | `0.875` |
| Like | `high` | `0.625` |
| Maybe | `medium` | `0.375` |
| Release | `low` | `0.125` |

Seeding at the center (not the edge) makes seed → `getBucket` an identity round-trip, which is the
fix for purses-7lh, and gives every item ±0.125 of headroom. Re-triage re-baselines to the new
center. Triage counts as one unit of evidence.

**Pass 2 — pairwise refines the seeded score:**

- **Win:** `score = clamp(score + 0.10, 0, 1)`
- **Loss:** `score = clamp(score - 0.05, 0, 1)`
- **Tie:** no score change for either item; counts as evidence for both ("no net swing").
- **Skip:** complete no-op — score unchanged, not counted, pair simply ignored.

Both compared items increment their evidence count on win/loss/tie (not on skip).

**Final preference per item:** `rankBucket = getBucket(score)`,
`confidence = min(1, comparisonCount / 10)`. Items with zero evidence are omitted.

**Cross-tier override is emergent, not special-cased.** Because headroom is 0.125 and a single
result moves at most 0.10, one comparison can never cross a boundary. With the asymmetric deltas:

- **2 consistent wins** promote a boundary (`+0.20 > 0.125`).
- **3 consistent losses** demote a boundary (`-0.15 > 0.125`; two losses, `-0.10`, stay put).

This is the affirmation bias: rising is easier than falling.

### Why this supersedes the jo2 structure

jo2 stored a triage base and a pairwise delta separately and added them, with the delta floored at
`>= 0`. That floor — and the two-number split that originally caused jo2's "pick one" bug — are
removed. h02 uses one seeded score that pairwise moves up *or* down. The jo2 unit tests encode the
old edge-seed numbers and are rewritten here (behaviors preserved, values updated).

## Worked examples

| Scenario | Score | Bucket |
|---|---|---|
| Triage Like, no pairwise | `0.625` | **Like** (7lh identity ✓) |
| Like, 2 net wins | `0.825` | **Love** (promoted ✓) |
| Like, 2 net losses | `0.525` | **Like** (stays — needs 3 ✓) |
| Like, 3 net losses | `0.475` | **Maybe** (demoted ✓) |
| Release item, 4 wins | `0.525` | **Like** (rescued upward ✓ symmetric) |
| Love item, sustained losses | clamps toward 0 | can reach **Release** ✓ symmetric |
| Like vs Like, tie | `0.625` both | **Like**, confidence rises (no net swing ✓) |
| any skip | unchanged | not counted ✓ |

## Edge cases

- **Clamping** is applied per step, keeping `score` in `[0, 1]` at all times.
- **Re-triage** re-baselines an item to the latest tier center.
- **Un-triaged item referenced by a pairwise decision** cannot occur in the real flow (the whole
  collection is triaged before comparison). Defensive default: seed at the Maybe center `0.375`
  (neutral), covered by a documenting test.
- **Order independence:** the two-pass structure makes the result independent of how triage and
  pairwise events interleave in storage.

## Scope and non-goals

**In scope:** `src/server/services/ScoringService.ts` and `ScoringService.test.ts` only.

**Out of scope (owned by purses-o93):** the gentle letting-go results section, affirmation copy,
compare/triage interaction, and the existing `results/[resultId]` page that currently renders all
four tiers as favorites. No type, schema, DB, API, or UI changes in h02.

## Testing plan (TDD)

Rewrite the five jo2 tests to the new seed values, then add:

1. **7lh round-trip identity** — each triage tier, no pairwise, buckets to its own tier.
2. **Promote across a boundary** — Like + 2 wins → Love.
3. **Demote across a boundary** — Like + 3 losses → Maybe; Like + 2 losses → stays Like.
4. **Tie is no-swing but counts** — score unchanged, `comparisonCount` increments.
5. **Release rescued upward** — Release item wins enough to enter favorites (symmetric).
6. **Favorite demoted into Release** — sustained losses push a favorite to `low` (symmetric).
7. **Confidence** — excludes skip, includes tie.
8. **Un-triaged-in-pairwise** — neutral `0.375` default (documents the defensive path).

## Related issues

- purses-7lh — resolved by the band-center seeding; closed when h02 lands.
- purses-o93 — unblocked; consumes the corrected, segregated data.
