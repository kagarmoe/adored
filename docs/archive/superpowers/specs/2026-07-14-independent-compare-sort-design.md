# Design: Independent Compare sort

- **Date:** 2026-07-14
- **Status:** Adversarially reviewed (QA, Security, Architect, Data, Craftsman, UX findings folded) — ready for `writing-plans`
- **Bead:** `purses-3bwk`
- **Authorities:** `PRODUCT.md`, `TONE.md`, `DESIGN.md`
- **Parent context:** `2026-07-06-usage-round-and-sort-unification-design.md`

## 1. User Decision

Adored has three kinds of sorting, and each must stand alone:

- **Triage:** "Do you like this?" Absolute feeling. Produces Love, Like, Maybe, Onward.
- **Usage:** "Do you use this?" Practical presence. Produces in-use and not-in-use.
- **Compare:** "Which do you love more?" Relative preference. Produces an ordered ranking from head-to-head choices.

The current implementation violates that model. Compare is available as a route and card, but its selector only considers items already in `top` or `high` Triage buckets. That makes Compare a Triage refinement, not a first-class sort.

## 2. Current Behavior

Code facts:

- `selectNextPair` builds its rankable set from preferences whose `rankBucket` is in `RANKABLE_BUCKETS`.
- `RANKABLE_BUCKETS` is `top` and `high`.
- A collection with only Usage decisions has no Compare candidates.
- A collection with no Triage decisions has no Compare candidates, even if it has two active items.
- `ScoringService` already handles pairwise-only events defensively by creating neutral `medium` preference rows, but `PreferenceStateService.deriveOrderRanks` currently refuses to rank those rows because they are not `top` or `high`.
- The hub card for Compare exists, so the UI appears to offer Compare independently while the backend selector quietly says no.

This is a product-truth bug, not a copy bug.

## 3. Design Decisions

### D1: Compare is its own axis

Compare answers a different question from Triage and Usage:

- Triage says how the person feels about one item by itself.
- Usage says whether the item is in the person's life right now.
- Compare says how two items relate when the person must choose between them.

These do not collapse into one score. They are separate layers. Used together, they add context; they do not erase each other.

### D2: Compare eligibility is item-based, not Triage-based

The first implementation scope is:

> Compare candidates are all live, active, non-disposed collection items for the curator.

Specifically:

- Include items with no Triage decision.
- Include items with no Usage decision.
- Include items with Triage `medium` or `low`; those feelings remain visible as labels, but they do not make the item ineligible for Compare.
- Exclude `set_aside` and `deferred` dispositions, matching the existing pairwise exclusion rule.
- Exclude deleted/purged items through the existing live item list.
- Require at least two eligible items.

No scope chooser ships in this slice. A later UI may let the person narrow Compare to Love/Like, Maybe, or another subset, but Compare itself must not depend on that future control.

### D3: One shared comparable-item selector

Selection and recompute must share one definition of "comparable", the same way Usage shares `selectUsageQueue`.

Add a pure helper, for example `selectComparableItems(items, dispositionByItemId)`, in `src/lib/compare-selection.ts` or folded into `pairwise-selection.ts` if that stays clearer.

Consumers:

- `selectNextPair`
- `PreferenceStateService.deriveOrderRanks`
- `recommendNextRound`
- tests that prove all three agree

This avoids a repeat of the current split where the hub appears to offer Compare but the selector has narrower rules.

### D4: Pairwise order is independent of Triage buckets

Compare-only decisions must produce a visible order.

The existing event log and preferences table are enough:

- Pairwise events continue to write `decision_events.type = "pairwise_compare"`.
- `ScoringService` continues to create preference rows for compared items with neutral `medium` bucket when no Triage exists.
- `PreferenceStateService` assigns `orderRank` from the comparable item set, not from top/high buckets.

This means a Compare-only session can create neutral `medium` rows with meaningful `orderRank`. The result can then show an ordered list even though no Triage buckets exist.

### D5: Standing/result composition shows layers, not one blended score

The result surface must tell the truth about which data exists:

- **Triage only:** current Love / Like / Maybe / Onward grouping remains valid.
- **Usage only:** no ranked "what you love most" result is claimed. Usage remains a presence layer.
- **Compare only:** show the pairwise order as the ranking, with neutral/no Triage badges.
- **Triage + Compare:** show the Compare order as the relative ranking, and show Triage buckets as badges or section/lens context. Triage can still mark an item Onward, but Compare evidence must not silently disappear just because a bucket exists.
- **Usage + Compare:** show the Compare order with usage chips.
- **All three:** show Compare order with Triage and Usage annotations.

The first implementation can keep the current result components if tests prove they show the pairwise order in Compare-only and mixed states. If bucket-first sorting hides Compare order, adjust `rankPreferencesToItems` or the live Standing composition so `orderRank` is visible when it exists.

No blended love-by-use score. No penalty for not using something loved.

Concrete ordering rule for this slice:

- When no preference row has `orderRank`, keep the current bucket-first order. That preserves Triage-only behavior.
- When any preference row has `orderRank`, rows with non-null `orderRank` sort first by `orderRank` globally, then rows with null `orderRank` fall back to current bucket priority and item id.
- `computedBucket` remains the Triage bucket. The bucket is annotation/partition context, not the primary sort key once Compare evidence exists.
- `partitionRanked` still keeps `low` rows in the Onward section. Compare can order low rows relative to one another, but a prior Onward choice is not relabeled as loved.

This is the smallest rule that makes Compare-only and mixed Compare results visible without adding a new table or a new result model.

### D6: Recommendation is a suggestion, not a gate

The hub may still recommend Triage first because it is lower load and creates useful groups. But Compare must be directly usable from the hub whenever at least two eligible items exist.

Recommendation ladder change:

- If untriaged items remain, Triage can remain the primary recommendation.
- If Usage is unknown, Usage can remain the primary recommendation or demote as today after a usage round.
- If two comparable items remain unordered, Compare is available and can be recommended when higher-priority suggestions are exhausted or demoted.
- If Usage-only has been done and a pair remains, Compare is a valid available next step even if Triage remains the primary recommendation.
- Decide/results should not be the recommended primary when there is no love ranking and no Compare order.

The card grid already exposes all three rounds, so most UI work is copy and empty-state honesty, not adding a new route.

### D7: Empty states become honest

The Compare empty state "All comparisons complete" must mean no pair remains under the new comparable-item selector, not "no top/high pair remains."

Copy should avoid machine-side language:

- Not enough items: "Add one more item to compare two side by side."
- Complete: "You've compared the pairs this round can offer."

Avoid "meaningful pairs" if it secretly means "only pairs in Love/Like"; under this design, the code should no longer mean that.

### D8: Tutorial copy teaches independence

Tutorial wording should say:

> Triage groups how you feel. Usage notes whether each thing is in your life right now. Compare puts things in relation to each other, two at a time. You can use any one of them, or layer them together.

When explaining "together":

> When used together, the sorts do not collapse into one score. Compare gives the order; Triage and Usage add context around that order. That is how Adored can show useful tensions: loved but resting, useful but not especially loved, or ready to move onward.

## 4. Non-Goals

- No new database table.
- No migration in the first slice.
- No scope chooser in the first slice.
- No blended scoring formula.
- No gamified compare progress.
- No swiping.
- No finalization semantics rewrite beyond what is necessary to make Compare order visible.

## 5. Acceptance Criteria

Behavior:

- A collection with two active, non-disposed items and zero Triage decisions opens Compare and shows a pair.
- A collection with only Usage decisions opens Compare and shows a pair.
- A collection with Triage `medium` and `low` items can still open Compare and show a pair.
- Disposed items are excluded from Compare.
- Pairwise-only decisions produce preference rows with non-null dense `orderRank`.
- Compare-only results show the pairwise order.
- Mixed Triage + Compare results do not hide pairwise order by sorting only by bucket.
- The hub card for Compare no longer leads to a false "complete" state when comparable items exist.

Tests:

- Pure selector tests cover no preferences, usage-only decisions, low/medium Triage buckets, dispositions, and completion.
- `recommendNextRound` tests prove the ladder no longer requires top/high buckets once it reaches Compare.
- Hub/page tests prove Usage-only collections can open Compare from the always-available Compare card even if Triage is still the primary recommendation.
- `PreferenceStateService` unit tests prove `deriveOrderRanks` no longer uses `RANKABLE_BUCKETS`.
- DB integration tests prove both decision write paths can write pairwise-only events: batch route for normal queue flush, single route for storage-quota fallback. Both must recompute preferences, assign dense order ranks, and reject either side of a foreign/deleted compare pair.
- Materialization tests prove `orderRank` wins globally when present, while Triage-only rows with no `orderRank` keep today's bucket-first order.
- Page test for Compare route proves no-Triage collection renders `CompareChoice`, not "All comparisons complete."
- Tutorial tests assert the new three-sort copy and the Compare independence message.

## 6. Risks

### R1: Cross-bucket ordering may fight the existing results layout

Current materialization sorts by bucket priority before `orderRank`. If Compare now orders all eligible items, a bucket-first result can hide the pairwise order across buckets.

Resolution required in implementation: either make result ordering honor `orderRank` when present, or explicitly design a layered result composition where Compare order is primary and Triage is annotation. Do not leave pairwise evidence invisible.

### R2: Existing comments and docs will become actively misleading

Several comments say Compare rankable means Love/Like or top/high. The implementation must update comments and tests alongside code, especially in:

- `src/lib/insertion-ranking.ts`
- `src/lib/pairwise-selection.ts`
- `src/server/services/PreferenceStateService.ts`
- `src/lib/next-round.ts`
- tutorial/onboarding copy tests

## 7. Adversarial Review

### QA / Test — CONCERNS folded

Finding: The draft said "real route" singular, but Compare writes through both the batch route and the single route fallback when local storage is unavailable. A green batch test alone would leave the fallback able to preserve the old Triage-only assumption.

Resolution: Acceptance now requires both write paths, plus pairwise semantic validation for either side of the pair.

### Security — CLEAN with required regression tests

Checked: both decision routes already authorize the session, require collection access, require the current user to be the session curator, reject terminal sessions, and validate pairwise item ids against the collection live-item set before writing. Widening Compare eligibility does not create a new IDOR path if those guards stay intact.

Required proof: tests must keep rejecting a compare pair when either `itemAId` or `itemBId` is foreign, deleted, or nonexistent.

### Architect / Data — BLOCK folded

Finding: The draft said "make Compare order visible" but did not name the exact materialization rule. Current `rankPreferencesToItems` sorts bucket-first, so mixed Triage + Compare could still hide the pairwise order while all tests for pair selection passed.

Resolution: D5 now pins the ordering rule: if any `orderRank` exists, non-null `orderRank` sorts globally before unranked fallback rows. Triage-only behavior is preserved because no `orderRank` exists.

### Craftsman — CLEAN

Checked: no new table, no migration, no scope chooser, no new event type. The change is a selector/projection correction around existing primitives.

### UX / Tone — CLEAN for this slice

Checked: the implementation slice changes Compare eligibility and result projection. It does not introduce a new interaction pattern, a scope chooser, swiping, gamification, urgency, or new visual density. How Compare feels after Triage is explicitly out of scope for this slice; the product decision is that Compare is independent.

Verdict: **CONCERNS**, all folded. Proceed to writing-plans.
