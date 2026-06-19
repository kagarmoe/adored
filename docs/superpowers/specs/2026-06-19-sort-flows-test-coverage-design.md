# Sort-flow test coverage — design (diagnostic characterization)

**Date:** 2026-06-19
**Scope:** Sorting Session, Triage, Compare, Results — the four core sort flows (already implemented).

## Why

The sort session is **known broken**, but TDD was skipped when it was built, so there is no test surface that says **which layer** fails. Without that, the repair can't be strategized. This effort builds the missing tests as a **diagnostic instrument**: they assert *intended* behavior across every layer, and the **failures localize the break(s)**.

## Goal & non-goals

- **Goal:** complete, multi-layer test coverage of the four flows — URL/slug-number routing, API routes (auth + contract), service/scoring logic, the DB persistence pipeline, UI interaction, and image rendering — such that running the suite produces a **failure map** pinpointing where the sort session breaks.
- **Non-goal — fixes.** This is *characterize-only* (owner decision). Tests pin behavior; where the code is wrong, the test documents reality and the divergence is **reported in chat** (no fixes, no new beads). Repairs get their own strategy + reviewed PR informed by this map.
- **Non-goal — unbuilt features.** Pause (`z76`), skip/not-yet (`x5u`), not-mine (`1an`), rehome (`oub`), story (`ib3`), the letting-go results section if absent, `jj9`, `gjr` are out of scope.
- **Non-goal — non-sort flows.** Collections CRUD (`kqs`), items+photo (`s47`) are separate beads.

## Approach

- **Characterization-as-diagnosis.** Tests assert the *intended* contract (scoring model, flow contract, UX). A failure is a finding, not a blocker — it is the deliverable.
- **Balanced pyramid** (owner decision). Logic, branches, and error paths at the cheapest correct tier (unit/integration); e2e only for what a browser proves (tap interaction, image rendering, slug/number routing, auth).
- **Outside-in ordering** so the break localizes fast: the full e2e journey and the `decision → preference → result` DB-integration test run first (they fail *at the broken seam*); per-layer unit tests then confirm which layers are individually sound, isolating a seam break from a unit break.
- **Coverage bar:** every public behavior, every branch/decision, every error path, every claimed invariant, every seam (per the adversarial-review QA persona). Real assertions over mock-call assertions; ≥1 test per layer crosses the real seam un-mocked.

## Prime suspect (pre-run hypothesis)

`purses-r7p`: the **sort-result creation flow's only caller is `SessionCompleteScreen`, which is dead code** (referenced only by itself). Plausible "doesn't work": triage/compare record decisions, but **no `SortResult` is ever generated through a live path**, so Results is empty. `ScoringService` already has 12 green unit tests, so the scoring *math* is likely sound — the break is more likely at the **result-creation / pipeline seam** than in a unit. The pipeline-integration and results-e2e tests are ordered to confirm or kill this first.

## Coverage by tier

### Tier 1 — Unit (vitest; mock only true boundaries: auth, db, Blob)
- **`PairingService`** (no tests today): `calculatePairingScore` branches (comparisonCount <5 / <10 / ≥10; confidence <0.7 boost; un-pref'd → 1.0) via `selectNextPair`; `getGoalBias` (favorites/top, refine/high, triage/low, no-goal, no-pref); `selectNextPair` (<2 items → null; top-2 selection/order); `prioritizeByGoal` (favorites / notes / brand+style / no-goal passthrough).
- **`PreferenceStateService`** (no tests today): `recalculatePreferences` create-new vs update-existing (batch-Map path), returned shape; `getItemPreferences` passthrough.
- **`SessionService` / `SortResultService` / `DecisionEventService` / `SortResultShareService`**: read each; test non-trivial methods (status transitions, draft→finalize→supersede rules, share token/expiry); skip pure pass-throughs (note them).
- **`sort-results` route handlers** (only authz-integration today): per-route `route.test.ts` for `POST` + `[id]` GET/PATCH/DELETE + `finalize` + `supersede` + `items` + `items/[rid]` GET/PATCH/DELETE + `reset` + `shares` + `shares/[sid]` — assert 401 / 403 / 404 (incl. belongs-to-parent) / 400 / success status+shape, per the established mocked-auth/db pattern. The known no-op `DELETE`s get a test pinning their current `200` (flagged in chat).
- **Interactive component gaps**: cover any interaction the existing page tests miss (triage tier buttons, compare tap-target, results tier + Onward sections).

### Tier 2 — DB integration (`src/lib/db/*.integration.test.ts`, `RUN_DB_TESTS=1`, ephemeral Postgres; mock only auth)
- **`sort-pipeline.integration.test.ts`** (new): seed collection + items + session → record triage decisions → `PreferenceStateService.recalculate` → assert persisted `CollectionPreferenceItem` rows (buckets/scores) → record pairwise → recalc → assert updates → **generate a `SortResult`** → assert `SortResultItem`s materialize from preferences. The full `decision → preference → result` path, un-mocked. This is the primary seam diagnostic.
- Complements existing `triage-decision`, `session-number`, `result-number`, `sort-results-authz` integration tests.

### Tier 3 — E2E (Playwright; one robust journey per flow + cross-cutting)
- **session**: start (StartSessionForm) → triage at the slug/number URL → persists/resumes → complete (SessionCompleteScreen).
- **triage**: hero image renders; tap a tier → advances → decision persists on reload; graceful no-photo state; controls above the fold.
- **compare**: "Which do you love more?"; tap-to-choose card; Tie/Skip secondary; gentle progress; pairwise recorded → next pair.
- **results**: tiers + hero images + Onward section + most-loved hero; finalize.
- **cross-cutting** (folded in): slug/number URLs (no raw ULIDs); auth redirect (unauth → /login); authenticated image rendering across all three.

## CI wiring (all tiers must run)

- Unit + route tests → `npm run test:ci` (vitest; new files auto-included).
- Integration → the `db-tests` job (`RUN_DB_TESTS=1`, serial, `src/lib/db`).
- E2E → the change-gated `e2e:` job (these specs touch sort/results UI, so they trigger).

## Deliverable

1. The test suite across the three tiers.
2. A **diagnosis report** (in chat / PR body): failure → location → likely cause, ordered to give the repair a starting strategy.

## Decisions resolved

- Bug handling: **characterize-only** (pin behavior, report in chat, no fixes, no new beads).
- Pyramid balance: **balanced** (logic/branches at unit/integration; journeys/images/routing/auth at e2e).
- Symptom-agnostic: the outside-in ordering surfaces the break regardless of the entry symptom.

## Advances

`purses-7io` (T11 sort session spec — triage + pairwise) and `purses-7dd` (E2E Phase 3 core specs). Confirms/kills `purses-r7p`.
