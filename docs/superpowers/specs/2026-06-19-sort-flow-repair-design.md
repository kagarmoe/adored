# Sort-flow repair — design (canonical TDD)

**Date:** 2026-06-19
**Scope:** Repair the **sessions → sort → results** core workflow so a curator who sorts can reach a populated result. Production-code fixes, driven by canonical TDD. Branch `fix/sort-flow-repair`.

## Why

Diagnosed in PR #207 (`docs/diagnosis/2026-06-19-sort-flow-findings.md`, bd memory `sort-flow-break-diagnosis`): `POST /api/sort-results` writes an empty draft (calls `SortResultRepository.create` directly, never materializes items); the complete populating logic in `SortResultService.createDraftResult` is **orphaned (never instantiated)**; a parallel `ResultController.createDraftResult` is a wired-but-stubbed TODO; and the only POST caller, `SessionCompleteScreen`, is **dead** — so no curator can reach a result. This repair makes the workflow work and turns the relevant RED `it.fails` tripwires green.

## Goal & non-goals

- **Goal:** one canonical owner of the `SortResult` lifecycle (create/finalize/supersede/delete) **and** a reachable, tone-respecting trigger that creates a *populated* result and navigates to it.
- **In scope:** consolidate the lifecycle on `SortResultService`; add repo `delete()`; repair the session-detail results trigger; delete the dead `SessionCompleteScreen`.
- **Not modified (already sound — both triage and compare):** triage and pairwise/compare decision-recording and the decision→preference seam are correct today (proven by the `triage-decision` integration test and ScoringService's triage+pairwise unit tests). The repair changes no triage/compare code; it makes their **combined** output reachable as a populated result and **verifies both decision types feed it** (see Testing tiers).
- **Out of scope (separate, diagnosis-tracked follow-ups):** `listShares` result-scoping (Share-side fix), `Release→Onward` tone (`purses-xca`), `StartSessionForm`→`/triage` flow, and the results-*presentation* redesign (`purses-o93`). Their tripwires (`shares/route.test` `it.fails`, the page `it.fails`, the e2e `test.fixme`) stay RED-quarantined.

## Resolved design decisions

**Canonical owner = `SortResultService`** (Architect decision). The lifecycle spans `SortResultRepository` + `SortResultItemRepository` + reads `CollectionPreferenceItemRepository` — multi-repo orchestration the repo already routes through a service (precedent: `decisions`/`preferences` routes construct services directly behind the route-level authz guards). Routes construct `SortResultService` with `getDb()`-backed repos; the `requireApiCollectionAccess`/`requireApiResultAccess` guards stay in the route (unchanged authz). `ResultController`'s stub/duplicate lifecycle methods are deleted once their routes move to the service.

**Result population is already correct in `createDraftResult`** — it reads the curator's `CollectionPreferenceItem` rows (scored incrementally by triage/compare via `PreferenceStateService.recalculatePreferences`), sorts by score, and creates one `SortResultItem` per preference. The Task-12 integration test already *proved* this materializes. So wiring `POST → createDraftResult` yields a **populated** result — satisfying the UX requirement that the trigger never land on an empty page; **no separate scoring step is added.**

**UI trigger = repair the existing inert card** (UX decision). `src/app/collections/[id]/sort/[sessionNumber]/page.tsx:~141` already renders a `bucketed > 0`-gated "Ready to see results?" card, but its button links to `/results` (the list — creates nothing). Repair it to: on tap, `POST /api/sort-results` (now populating) → `router.push` to `/collections/{slug}/results/{number}`. Reject auto-generate (violates TONE "one decision at a time / unpressured / the person sets the pace"). Person's-side copy:

| Element | New copy |
|---|---|
| Heading | **See what you love most** |
| Body | **Whenever you're ready, gather what you've chosen so far into one place.** |
| Button | **Show me what I love** |

States: loading → button label "Gathering…" (disabled, no overlay); empty → card stays hidden (`bucketed === 0`); error → inline, soft, reversible ("That didn't come together just now. Nothing was lost — try again whenever you like.") + re-enable; success → quiet `router.push` (no celebration). **Delete `SessionCompleteScreen.tsx` + its test** (dead, modal-heavy, tone-violating) once the inline trigger carries the create-then-navigate logic.

## Wiring (route → service)

| Route | Today | Target |
|---|---|---|
| `POST /api/sort-results` | raw `SortResultRepository.create` (empty) | `SortResultService.createDraftResult(collectionId, curatorId, name)` (populates from preferences) |
| `POST /api/sort-results/[id]/supersede` | `ResultController.supersedeResult` (throws) | `SortResultService.supersedeResult(id)` (clone; `null` → route 404, else 201) |
| `DELETE /api/sort-results/[id]` | `ResultController.deleteResult` (no-op 200) | `SortResultService.deleteResult(id)` — **new** (draft-only; finalized are immutable → 409) |
| `DELETE /api/sort-results/[id]/items/[rid]` | `ResultItemController.deleteResultItem` (no-op 200) | `SortResultService.deleteResultItem(rid)` — **new** |
| `GET /[id]` / `PATCH /[id]` / `finalize` | `ResultController` (these WORK) | migrate to `SortResultService` equivalents (`getResult`/`updateResultName`/`finalizeResult` exist) — **last, one route per commit**, each guarded by its existing green tests |

## Repo additions

`ISortResultRepository.delete(id)` and `ISortResultItemRepository.delete(id)` + their implementations. **Hard delete** (drafts are disposable; finalized results are immutable per the infra spec and are *not* deletable — `deleteResult` guards `status === "draft"`, else 409). `deleteResult` removes the result and cascades its `SortResultItem` rows (DB FK cascade or explicit). Test-first (interface + impl behavior).

## TDD method — canonical, no shortcuts

Every behavior is one **Red → Green → Refactor** cycle:
1. **Red:** write the smallest failing test for that behavior, **run it, and capture the failure output** — it must fail for the intended reason before any production code. Promoting the matching `it.fails` tripwire to a plain `it` happens here (it errors once the body passes, forcing promotion); where the tripwire is coarse, write the finer unit test first.
2. **Green:** the minimal production code to pass — nothing more.
3. **Refactor:** clean up, suite stays green.
4. Run the **full suite** (no regressions) → commit. Then the next behavior.

The implementer's report **must show the red-phase failure first, then green** — no test+code written together.

## Sequence (Architect order; each step = TDD cycle(s))

1. **Repo `delete()`** on both interfaces + impls (test-first).
2. **`SortResultService.deleteResult`** (draft-only guard + hard delete + item cascade) and **`deleteResultItem`** (test-first).
3. **Wire `POST` → `createDraftResult`** → promotes `route.test.ts` POST-materialize tripwire **and** the always-on `sort-results-authz.integration.test.ts` seam tripwire (live POST → non-empty items).
4. **Wire `[id]/supersede` → `supersedeResult`** (promote supersede tripwire); **`[id] DELETE` → `deleteResult`** (promote deleteResult tripwire); **`items/[rid] DELETE` → `deleteResultItem`** (promote deleteResultItem tripwire).
5. **Migrate `GET`/`PATCH`/`finalize`** to the service — one route per commit, each guarded by its existing green tests.
6. **Delete `ResultController`'s migrated/stub methods** (+ `ResultItemController` delete stub); run `npm run test:ci` + the DB tier to confirm no orphaned import.
7. **UI trigger:** repair the session-detail card (create→navigate, new copy, states); **delete `SessionCompleteScreen`** + test; add an e2e for the reachable journey (sort → "Show me what I love" → populated results page).

## Testing tiers (all run in CI)

- **Unit:** `SortResultService` create/finalize/supersede/delete/deleteResultItem; repo `delete()`. (`test:ci`)
- **Integration:** the live `POST → populated result` un-mocked seam (the always-on `db-tests` tripwire flips green here). **Both decision types must be exercised:** record a **triage** decision **and** a **pairwise compare** decision in the session, recalc, then assert the created result reflects **both** — the ranking includes the triaged tier placement *and* the pairwise refinement — proving triage *and* compare both reach results, not just one. (`RUN_DB_TESTS`)
- **E2E:** the reachable trigger journey — start a session, make at least one **triage** and one **compare** decision, tap "Show me what I love", land on a **populated** results page. (`e2e:` job)

## Error handling

Route-level authz guards unchanged (`requireApiCollectionAccess`/`requireApiResultAccess`). `deleteResult` refuses non-draft (finalized immutable → 409). `supersedeResult` `null` → 404. `POST` keeps 400-on-missing-fields and forces `curatorId` from the session (never the body). UI trigger: gentle, reversible error; input/state never lost.

## Tripwires this repair turns green (the regression guards)

`route.test.ts` POST-materialize · `sort-results-authz.integration.test.ts` live-POST→items · `supersede` 201+clone · `[id]` DELETE-removes-result · `items/[rid]` DELETE-removes-item. Each is promoted from `it.fails`/`test.fails` to a plain test as its body passes. The out-of-scope tripwires (`listShares` scoping, `Release→Onward`, start-form→triage) stay RED.

## Advances

Repairs the core of `purses-r7p` (result-creation flow). Leaves `purses-xca`, `listShares`, `purses-o93`, and the start-form flow as tracked follow-ups.
