# Plan: Independent Compare sort

**Spec:** `docs/superpowers/specs/2026-07-14-independent-compare-sort-design.md`

**Bead:** `purses-3bwk`

**Architecture:** Compare becomes item-based instead of Triage-bucket-based. One shared comparable-item selector feeds pair selection, preference recompute, and the hub ladder. Pairwise-only decisions already fit the event log and preference table; the implementation makes their `orderRank` visible in live/finalized results. Triage and Usage remain independent layers.

## Task 1: Comparable item selector and pair selection

**Files:**

- Modify: `src/lib/pairwise-selection.ts`
- Modify: `src/lib/pairwise-selection.test.ts`
- Possibly add: `src/lib/compare-selection.ts`

**Steps:**

1. Add failing tests:
   - no preferences, two active items -> `selectNextPair` returns a pair
   - usage-only decisions do not block pair selection
   - `medium` and `low` preference buckets remain comparable
   - `set_aside` and `deferred` items are excluded
   - fully ordered comparable set returns `null`
2. Implement a shared comparable-item helper:
   - input: `items`, `dispositionByItemId`
   - output: live active items not `set_aside` or `deferred`
   - no dependency on `preferences`
3. Update `selectNextPair` to derive `rankItems` from that helper, not `RANKABLE_BUCKETS`.
4. Remove or rewrite comments that say Compare only ranks top/high.

**Verify:**

```bash
npm run test:ci -- src/lib/pairwise-selection.test.ts src/lib/insertion-ranking.test.ts
```

## Task 2: Recompute assigns orderRank for Compare-only rows

**Files:**

- Modify: `src/server/services/PreferenceStateService.ts`
- Modify: `src/server/services/PreferenceStateService.test.ts`
- Modify: `src/lib/db/binary-insertion-ranking.integration.test.ts` or `src/lib/db/sort-pipeline.integration.test.ts`

**Steps:**

1. Add failing unit tests proving `deriveOrderRanks` ranks neutral `medium` preference rows created by pairwise-only events.
2. Update `PreferenceStateService.deriveOrderRanks` to use the shared comparable-item helper, not `RANKABLE_BUCKETS`.
3. Add a DB integration test:
   - seed collection with two active items and a session
   - record pairwise decisions with no Triage decisions
   - run real recompute path
   - assert both preference rows exist, both have `rankBucket: "medium"`, and dense `orderRank` values reflect the comparison
4. Preserve the existing partial-unique clear-before-upsert behavior.

**Verify:**

```bash
npm run test:ci -- src/server/services/PreferenceStateService.test.ts
npm run test:db -- src/lib/db/binary-insertion-ranking.integration.test.ts
```

## Task 3: Result materialization makes Compare order visible

**Files:**

- Modify: `src/server/services/sortResultMaterialization.ts`
- Modify: `src/server/services/sortResultMaterialization.test.ts`
- Modify as needed: `src/features/results/standing.test.ts`

**Steps:**

1. Add failing tests for the reviewed ordering rule:
   - Triage-only rows with all `orderRank: null` keep current bucket-first order
   - Compare rows with non-null `orderRank` sort globally by `orderRank` before unranked fallback rows
   - `low` rows keep `computedBucket: "low"` so `partitionRanked` still sends them to Onward
2. Implement the ordering rule in `rankPreferencesToItems`.
3. Update comments that currently describe bucket priority as unconditional.
4. Add or adjust live Standing tests to prove Compare-only order drives the hero/full ranking.

**Verify:**

```bash
npm run test:ci -- src/server/services/sortResultMaterialization.test.ts src/features/results/standing.test.ts
```

## Task 4: Route and page behavior for Compare without Triage

**Files:**

- Modify: `src/app/collections/[id]/sort/[sessionNumber]/compare/page.test.tsx`
- Modify as needed: `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx`
- Modify DB integration tests for decision routes if current coverage is missing

**Steps:**

1. Add a Compare page test where:
   - items exist
   - preferences are empty
   - decisions may be empty or usage-only
   - page renders `CompareChoice`, not "All comparisons complete"
2. Add a hub/session page test proving Compare card is available even when Triage remains the recommended primary action.
3. Add route integration coverage for pairwise-only writes through:
   - batch route, normal queue path
   - single route, localStorage quota fallback path
4. In both route paths, pin rejection when either compare side is foreign, deleted, or nonexistent.
5. Update empty-state copy if tests reveal "meaningful pairs" no longer matches the selector.

**Verify:**

```bash
npm run test:ci -- 'src/app/collections/[id]/sort/[sessionNumber]/compare/page.test.tsx' 'src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx'
npm run test:db
```

## Task 5: Recommendation copy and tutorial reality

**Files:**

- Modify: `src/lib/next-round.ts`
- Modify: `src/lib/next-round.test.ts`
- Modify: `src/features/sorting/roundCopy.ts`
- Modify: `src/features/onboarding/WelcomeUsage.tsx`
- Modify: `src/features/onboarding/WelcomeCompare.tsx`
- Modify: `src/features/onboarding/WelcomeStanding.tsx`
- Modify related onboarding tests

**Steps:**

1. Update `ROUND_COPY.compare` so Compare reads as first-class, not only refinement.
2. Update `recommendNextRound` tests:
   - ladder still may recommend Triage first
   - when the ladder reaches Compare, it no longer requires top/high buckets
   - usage demotion still does not re-promote Usage
3. Update tutorial copy:
   - Triage groups feeling
   - Usage records practical presence
   - Compare creates relative order
   - together they layer context instead of creating one blended score
4. Keep phone button copy short enough to fit existing mobile rules.
5. Verify tutorial still has tablet/web and phone layouts.

**Verify:**

```bash
npm run test:ci -- src/lib/next-round.test.ts src/features/onboarding/beats.test.tsx src/features/onboarding/WalkthroughShell.test.tsx src/features/onboarding/copy-a11y.test.tsx
```

## Task 6: Whole-slice verification and review

**Steps:**

1. Run focused tests from Tasks 1-5.
2. Run full project gates appropriate for this behavior change:

```bash
npm run lint
npm run test:ci
npm run build
npm run auth:verify
npm run test:db
```

3. Use Playwright screenshots for:
   - Compare without Triage, phone and tablet/web
   - tutorial sort explanation, phone and tablet/web
   - results after Compare-only
4. Run adversarial review again before PR:
   - QA: unmocked route/service/repo proof runs in CI or `test:db`
   - Security: pairwise item validation on both routes
   - Architect/Data: selector/recompute/result ordering all share the same comparable definition
   - UX/Tone: Compare remains optional and one-decision-at-a-time

## Open Questions

- Should a later scope chooser let the person narrow Compare to "everything", "Love/Like", or "not Onward"? Not in this slice.
- Should Usage-only eventually get its own result surface? The parent spec says yes, but this plan only changes Compare independence.
