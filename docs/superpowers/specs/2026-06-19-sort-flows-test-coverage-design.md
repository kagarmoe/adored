# Sort-flow test coverage — design (diagnostic, RED-first)

**Date:** 2026-06-19 (rev. 2 — folds the adversarial spec-review BLOCK)
**Scope:** Sorting Session, Triage, Compare, Results — the four core sort flows (already implemented).

## Why

The sort session is **known broken**, but TDD was skipped when it was built, so there is no test surface that says **which layer** fails. This effort builds the missing tests as a **diagnostic instrument**: they assert *intended* behavior across every layer, and the tests that **fail localize the break** and become the **regression guard** the repair flips green.

## Goal & non-goals

- **Goal:** complete, multi-layer test coverage of the four flows — URL/slug-number routing, API routes (auth + contract), service/scoring logic, the DB persistence pipeline, UI interaction, image rendering — such that the suite's **red tests pinpoint where the sort session breaks** and guard the eventual repair.
- **Non-goal — fixes.** *Characterize-only* = **no production-code changes in this effort.** Where the code is broken, the test asserts the **intended** behavior and is left **failing-but-quarantined** (see Approach) — it is NOT rewritten to assert the broken behavior. Repairs get their own strategy + reviewed PR informed by this map.
- **Non-goal — unbuilt features.** Pause (`z76`), skip/not-yet (`x5u`), not-mine (`1an`), rehome (`oub`), story (`ib3`), the letting-go results section if absent, `jj9`, `gjr`.
- **Non-goal — non-sort flows.** Collections CRUD (`kqs`), items+photo (`s47`) are separate beads.

## Approach — RED-first diagnosis (resolves the rev-1 contradiction)

Rev-1 said both "failures are the deliverable" *and* "pin actual broken behavior green." Those contradict, and pinning-green buries the diagnosis + inverts into a test that fails on the fix. Resolution:

- **Assert intended behavior. Let it go RED at the break.** The red test *is* the localization and the repair's regression tripwire.
- **Quarantine known reds so required CI stays green:** mark each known-failing diagnostic test `test.fails()` (vitest — the suite passes while the body fails, and **errors the moment the body starts passing**, i.e. when the bug is fixed, forcing the repairer to promote it to a normal passing test). Where `test.fails()` doesn't fit, use `it.skip` (vitest 1.6.1 has no `test.fixme`) with a `// BROKEN(purses-r7p): intended X, actual Y` tag. Either way the break is a *named test*, not a buried comment, and never a green assertion of broken behavior.
- **Balanced pyramid** (owner decision): logic/branches/error-paths at unit/integration; e2e only for what a browser proves (tap, image rendering, slug/number routing, auth).
- **Seam-first ordering** (rev-1 had it backwards): the load-bearing seam assertions (result-creation) come **first**, not after 9 unit tasks — they carry the diagnosis; the unit coverage is debt-repayment around them.
- **Coverage bar:** every public behavior, branch, error path, claimed invariant, seam. Real assertions over mock-call assertions; ≥1 un-mocked cross-layer test per seam.

## Confirmed diagnosis (verified during spec review — not a hypothesis)

The review read the code and confirmed the break is **result creation**, but the rev-1 causal story was wrong. The accurate picture:

- `POST /api/sort-results` (`src/app/api/sort-results/route.ts:29`) calls `SortResultRepository.create({status:"draft"})` **directly** → an empty draft, **zero `SortResultItem`s materialized**.
- `SortResultService.createDraftResult` (the path that *does* materialize items from preferences) is **fully orphaned — never instantiated anywhere** in `src/` or `e2e/`. Not "called only by `SessionCompleteScreen`."
- A **second** populating method, `ResultController.createDraftResult` (`src/server/api/results.ts:23`), exists on the controller that **is** wired into the `[id]` route tree — but it is a **stub** (`// TODO: create SortResultItems`) and **no route calls it**; the live create path remains the top-level `POST /api/sort-results` (above).
- `finalize` route → `ResultController.finalizeResult` (sets status, no items). `supersede` route → `ResultController.supersedeResult` which **throws "not implemented"** (`results.ts:~87`). The correct `SortResultService.supersedeResult` (clones items) is never reached.
- `SessionCompleteScreen.tsx:40` `fetch`es the empty `POST /api/sort-results` route — and is itself **dead** (mounted by no page; no `complete` segment in the sort route tree).
- **Net live failure mode: no `SortResult` is created through any live UI path at all** (the sole caller is dead) → Results is empty/absent. The route, called directly (as tests do), produces an *empty* result.
- `ScoringService` has **10** green unit tests (not 12); the scoring math is sound. The break is the **result-creation seam**, not the units.

So the diagnosis is essentially known; the suite's job is to (a) pin these breaks as **RED regression tripwires** so the repair is guarded, and (b) pay down genuine test debt on the sound layers (repo policy: *YAGNI does not apply to tests*).

## Coverage by tier

### Tier 1 — Unit (vitest; mock only true boundaries: auth, db, Blob)
- **`PairingService`** — ✅ **DONE** (committed, 6/6 green; layer sound).
- **`PreferenceStateService`** — ✅ **DONE** (committed, 4/4 green; layer sound).
- **`SessionService` / `SortResultService` / `DecisionEventService` / `SortResultShareService`**: test non-trivial methods (status transitions; `createDraftResult` materialization; `finalize`/`supersede` clone rules; share token/expiry); skip pure pass-throughs (note them). These pin the **correct** service behavior the routes fail to call.
- **`sort-results` route handlers**: per-route `route.test.ts` for `POST` + `[id]` GET/PATCH/DELETE + `finalize` + `supersede` + `items` + `items/[rid]` GET/PATCH/DELETE + `reset` + `shares` + `shares/[sid]` — assert 401/403/404 (incl. belongs-to-parent)/400/success per the established mocked pattern. **RED tripwires:** `POST` asserts items are materialized (`test.fails` — currently 0); `supersede` asserts 201 + cloned items (`test.fails` — route catches the throw, returns 500, so the assertion fails cleanly); the no-op `items/[rid] DELETE` asserts deletion (`test.fails` — currently no-op 200).
- **Interactive component gaps**: only what existing page tests miss (triage tier buttons, compare tap-target, results tier + Onward sections) — no redundant re-tests.

### Tier 2 — DB integration (`src/lib/db/*.integration.test.ts`, `RUN_DB_TESTS=1`, ephemeral Postgres; mock only auth) — the always-on seam guard
- **The seam tripwire goes here, not e2e** (the e2e job is skippable — see CI). Drive the **real** `POST /api/sort-results` handler un-mocked, then assert `SortResultItemRepository.findByResult(newId)` materializes items (`test.fails` — currently `[]`). This is ~one assertion added to the **existing** `src/lib/db/sort-results-authz.integration.test.ts` (which already drives live POST un-mocked) **or** a small new `sort-pipeline.integration.test.ts` — do NOT duplicate the authz file's setup.
- New end-to-end-of-the-real-seam assertions worth their keep: triage decision → persisted preference bucket. Assert **persistence and direction**, not the exact scoring arithmetic (already covered by `ScoringService`'s 10 unit tests — do not re-derive).
- A separate assertion exercises `SortResultService.createDraftResult` → `SortResultItem`s. **Label it as characterizing the intended-but-unwired path** (the service is orphaned — this is a future-repair target, not a live-seam guard; the live-seam tripwire is the `POST`-route assertion above).

### Tier 3 — E2E (Playwright; one robust journey per flow + cross-cutting)
- **session**: start → triage at the slug/number URL → persists/resumes. (No `complete` screen exists — do not assert one.)
- **triage**: hero image renders; tap a tier → advances → decision persists on reload; graceful no-photo state; controls above the fold.
- **compare**: "Which do you love more?"; tap-to-choose card; Tie/Skip secondary; gentle progress; pairwise recorded → next pair.
- **results (renderer-only — label it):** load a **seeded** populated result (Task 11 seeds via the correct `SortResultService.createDraftResult`) and assert tiers + hero images + Onward render. **This carries zero diagnostic signal about the break** — it proves only the presentation layer on synthetic data; say so.
- **live-path divergence (rewritten):** the rev-1 "fresh sort via the live UI → Results empty" is **unexecutable** — no live UI path creates a result. Assert the *observable* live truth instead: completing a sort offers **no reachable "generate results" affordance** / no result row appears. The authoritative seam proof is the Tier-2 integration tripwire, not e2e.
- **cross-cutting:** slug/number URLs (no raw ULIDs); auth redirect (unauth → /login); authenticated image rendering.

## CI wiring

- Unit + route → `npm run test:ci` (always runs; new files auto-included).
- Integration → the `db-tests` job (`RUN_DB_TESTS=1`, serial) — **always runs; this is why the seam tripwire lives here.**
- E2E → the `e2e:` job, which is **change-gated on UI paths and reported green when skipped** — a server-only refactor that breaks the pipeline would skip e2e. So e2e is journey/renderer coverage, **not** the seam guard.

## Deliverable

1. The test suite across the three tiers, with the confirmed breaks as named RED (`test.fails`/`fixme`) tripwires.
2. A **diagnosis report** (`docs/diagnosis/…`, + PR body): symptom → location → likely cause, **derived from the actual test run** (not copied from this pre-run section), leading with the result-creation break and naming the two orphaned populating paths + the stub controller.

## Decisions resolved

- Bug handling: **characterize-only = no fixes.** Diagnostic tests assert **intended** behavior and are **RED-quarantined** (`test.fails`/`it.skip`), never pinned green to broken behavior. (Supersedes the rev-1 "pin actual" rule.)
- Pyramid: **balanced**; **seam-first** ordering.
- Seam guard lives in the **always-on integration tier**, not the skippable e2e job.

## Review changelog (rev-2)

Folded the spec-review BLOCK: (1) RED-first replaces pin-green; (2) corrected diagnosis — `SortResultService` fully orphaned, second stubbed path `ResultController`, `supersede` throws, live mode = "no result created at all"; (3) reconciled state — `PairingService`/`PreferenceStateService` done, ScoringService = 10 tests; (4) seam tripwire moved to the always-on integration tier + dedup with the existing authz integration test; (5) e2e divergence check rewritten to the observable live truth; (6) report cause derived from the run.

## Advances

`purses-7io`, `purses-7dd`. Confirms/guards `purses-r7p`.
