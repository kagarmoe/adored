# Sort-flow failure localization map

**Date:** 2026-06-19
**Branch:** `test/sort-flow-diagnostics`
**Method:** RED-first diagnostic suite. Every cause below is verified against the actual
test run (counts in *Suite run* below) and the named source line — not copied from a
hypothesis. The suite is **characterize-only**: it adds no `src/**` changes and pins each
break with a quarantined tripwire that stays green today and *errors* the moment the layer
is repaired (see *How to read the tripwires*).

---

## Suite run (the evidence base)

Three tiers, all green, with the breaks held in quarantine:

| Tier | Command | Result |
|---|---|---|
| Unit + route | `npm run test:ci` | **414 passed, 93 skipped** (62 files passed, 14 skipped) |
| Integration (DB) | `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db` | **93 passed** (14 files) |
| E2E | `npx playwright test` | **61 passed, 3 skipped** (3 = one `test.fixme` × 3 projects) |

"Skipped" at the unit tier is dominated by the `RUN_DB_TESTS`-gated integration files that
only run under the DB tier; the diagnostic tripwires themselves count as **passes** because
they are green-as-expected-failure (`test.fails`/`it.fails`) or `test.fixme`.

### Tripwire inventory (`grep -rn "test.fails\|it.fails\|test.fixme\|BROKEN(" src e2e`)

Nine pinned tripwires across seven files (the e2e `test.fixme` runs ×3 Playwright
projects, so a `grep`/run that counts project instances reports more — these are the
distinct test *definitions*):

1. `src/app/api/sort-results/route.test.ts:116` — `test.fails` (POST materializes one item per preference).
2. `src/app/api/sort-results/[id]/supersede/route.test.ts:100` — `it.fails` (supersede 201 + clones items).
3. `src/app/api/sort-results/[id]/items/[rid]/route.test.ts:204` — `it.fails` (DELETE removes the item).
4. `src/app/api/sort-results/[id]/route.test.ts:182` — `it.fails` (DELETE actually removes the result — the `deleteResult` aggregate no-op; see Finding 3a).
5. `src/app/api/sort-results/[id]/shares/route.test.ts:76` — `it.fails` (listShares scoped to the result id).
6. `src/app/collections/[id]/results/[resultNumber]/page.test.tsx:150` — `it.fails` + `BROKEN(purses-xca)` (low tier reads "Onward", not "Release").
7. `src/lib/db/sort-results-authz.integration.test.ts:306` — `it.fails` (live `POST` → non-empty items; the always-on seam guard).
8. `e2e/sort-session.spec.ts:115` — `test.fixme` + `BROKEN:` (StartSessionForm lands on `/triage`).

(Items 1 and 7 are two tripwires — unit and integration — on the **same** headline break, pinning it at two layers.)

---

## Findings (outside-in, grouped by flow)

### 1. Result creation — the headline break: no live path materializes a populated `SortResult`

**Symptom:** Creating a sort result yields an empty draft with zero `SortResultItem` rows.
There is, in fact, no reachable UI affordance that creates a result at all.

**Layered cause — three converging defects:**

- **Live POST writes an empty draft.** `POST /api/sort-results`
  (`src/app/api/sort-results/route.ts:29`) calls `new SortResultRepository(db).create({ … status: "draft" })`
  **directly** — it never reads preferences and never creates any `SortResultItem`. A created
  draft is empty by construction.
- **The complete populating path is fully orphaned.** `SortResultService.createDraftResult`
  (`src/server/services/SortResultService.ts:12`) is correct and complete: it creates the
  draft, loads `preferenceRepo.findByCollection`, sorts by `score` desc, and writes one ranked
  `SortResultItem` per preference (`computedRank`, `computedBucket`). But `SortResultService`
  is **never instantiated anywhere in `src/**`** — the only `new SortResultService(...)` call
  sites are unit tests and `e2e/fixtures/seed.ts` (renderer scaffolding). It is dead-but-correct code.
- **The wired second path is a stub.** `ResultController.createDraftResult`
  (`src/server/api/results.ts:23`) *is* wired into the `[id]` routes (those routes import
  `ResultController`), but its body carries `// TODO: Create SortResultItems from computed
  preferences` and only calls `resultRepo.create(...)` — no items. Worse, the live `POST
  /api/sort-results` route doesn't even route through this controller; it bypasses it for the
  raw repo call above.
- **The only live caller of the POST is dead.** `SessionCompleteScreen`
  (`src/features/sessions/SessionCompleteScreen.tsx`) is the component that would POST to
  create a result, but it is **not rendered by any route** — `grep` finds zero references to it
  under `src/app`. The session-detail page links only to Triage, Compare, and the results
  *list*; Triage/Compare only POST decisions. So **no live UI path creates a `SortResult` via
  any route.** (Confirmed walking the live UI in Task 13.)

**Tripwires:**
- Unit — `src/app/api/sort-results/route.test.ts:116` `test.fails`: asserts the POST invokes
  `SortResultItemRepository.create`. Today the route never does, so the body fails and the
  suite stays green; flipped to `it`, it FAILs ("1 failed | 5 passed").
- Integration (always-on seam guard) — `src/lib/db/sort-results-authz.integration.test.ts:306`
  `it.fails`: seeds two items + the curator's `CollectionPreferenceItem` rows, drives the **real**
  un-mocked `POST`, asserts `SortResultItemRepository.findByResult(newId).length > 0`. Flipped to
  `it`: `AssertionError: expected 0 to be greater than 0` — `findByResult` returns `[]`.

### 2. Supersede — route runs the throwing stub → 500

**Symptom:** `POST /api/sort-results/[id]/supersede` returns 500 instead of 201.

**Cause:** The route (`src/app/api/sort-results/[id]/supersede/route.ts:19`) wires
`ResultController.supersedeResult`, whose body is `throw new Error("Supersede not yet
implemented - requires SortResultItems copy logic")` (`src/server/api/results.ts:87`). The
route's catch maps any non-`"Unauthorized"` error to 500. (Note: the orphaned
`SortResultService.supersedeResult` at `SortResultService.ts:96` is the *complete* clone-into-
new-draft implementation — the same orphan as Finding 1.)

**Tripwire:** `src/app/api/sort-results/[id]/supersede/route.test.ts:100` `it.fails`
("supersede returns 201 and clones the result's items"). Flipped to `it`:
`AssertionError: expected 500 to be 201`.

### 3. deleteResultItem — DELETE is a no-op that lies with 200

**Symptom:** `DELETE /api/sort-results/[id]/items/[rid]` returns 200
`{ message: "Item removed from result" }`, but the item is still there.

**Cause:** The route (`src/app/api/sort-results/[id]/items/[rid]/route.ts:77`) calls
`controller.deleteResultItem()` — a no-op stub — then returns 200 regardless. Compounding it,
`ISortResultItemRepository` has **no `delete` method** at all (only create/findById/
findByResult/update), so deletion cannot be implemented without first adding a repo delete path.

**Tripwire:** `src/app/api/sort-results/[id]/items/[rid]/route.test.ts:204` `it.fails`
("DELETE removes the result item") — store-backed repo, asserts the item is gone after DELETE.
Flipped to `it`: `AssertionError: expected { Object (id, sortResultId, …) } to be null`.

### 3a. deleteResult — the *aggregate* DELETE is the same no-op that lies with 200

**Symptom:** `DELETE /api/sort-results/[id]` returns 200 `{ message: "Result deleted" }`,
but the `SortResult` (and its items) are still there. Same lie as Finding 3, one level up:
deleting the *whole result*, not a single item.

**Cause:** The route (`src/app/api/sort-results/[id]/route.ts:65`) calls
`controller.deleteResult(params.id)`, whose body validates the result exists and is a draft,
then ends at `// TODO: Implement hard delete for draft result` (`src/server/api/results.ts:73`)
— it never deletes. The route returns 200 regardless. (`ISortResultRepository` likewise has no
`delete` method, so — as with Finding 3 — deletion can't be implemented without first adding a
repo delete path.)

**Tripwire:** `src/app/api/sort-results/[id]/route.test.ts:182` `it.fails`
("DELETE actually removes the result") — store-backed repo, asserts the result is gone after
DELETE (`findById` returns null). Flipped to `it`:
`AssertionError: expected { id: 'sr1', collectionId: 'c1', …(7) } to be null`. Green-as-`it.fails`
today; errors the moment hard-delete ships. This replaces the previously mock-deep "deletes a
draft result on success" test (renamed to the honest status-only "DELETE /sort-results/[id]
returns 200"), which asserted only 200 + message and so rubber-stamped the no-op.

### 4. listShares — TODO stub returns hardcoded `[]`, unscoped to the result

**Symptom:** `GET /api/sort-results/[id]/shares` always returns `[]`, never the result's
actual shares.

**Cause:** The route calls `controller.listShares()` with **no arguments**, and
`ShareController.listShares` (`src/server/api/shares.ts:21`) is `// TODO: Implement when
ShareRepository.findByResult available` → `return []`. It ignores `params.id` entirely, so the
endpoint is both empty and unscoped. (`createShare`/`getShare`/`updateShare`/`revokeShare`/
`viewSharedResult` on the same controller are real and pass.)

**Tripwire:** `src/app/api/sort-results/[id]/shares/route.test.ts:76` `it.fails` ("lists the
shares scoped to this result id") — asserts `toEqual([scopedShare])`. Green-as-`it.fails` today.

### 5. Release tone — `ItemCard` low tier still labeled "Release", not "Onward" (purses-xca)

**Symptom:** The lowest results tier renders the word "Release" — letting-go framing the tone
contract forbids ("Onward").

**Cause:** `src/features/items/ItemCard.tsx:27` defines `bucketLabels.low = "Release"`, applied
as the badge `title` at `ItemCard.tsx:49`. The results page passes `bucket` to `ItemCard`, so
the shaming word reaches the DOM as an attribute (which a `queryByText` check silently missed —
see Task 10/11 Finding A). Tracked by **purses-xca**.

**Tripwire:** `src/app/collections/[id]/results/[resultNumber]/page.test.tsx:150` `it.fails` +
`BROKEN(purses-xca)`: scans the whole render —
`container.querySelector('[title="Release"]')` is null AND `innerHTML` does not contain
"Release". Flipped to `it`: fails at the `[title="Release"]` badge.

### 6. Flow gap — StartSessionForm lands on session *detail*, not `/triage`

**Symptom:** Starting a session does not drop the curator into sorting; they land on a detail
page that merely links onward.

**Cause:** `StartSessionForm.handleSubmit` (`src/features/sorting/StartSessionForm.tsx:40`)
`router.push`es to `/collections/${slug}/sort/${number}` — the **session-detail** page — with no
auto-advance to `/triage`. The intended journey (start → triage) is therefore unfulfilled by
the code. Quarantined rather than weakened to match the bug.

**Tripwire:** `e2e/sort-session.spec.ts:115` `test.fixme` + `BROKEN:` ("StartSessionForm lands
DIRECTLY on the triage screen"). Skipped across all three Playwright projects (the 3 "skipped"
in the e2e run). The adjacent passing test proves the *reachable* flow: start → numbered sort
URL → triage route resolves.

### 7. What is sound (stated explicitly — no break here)

The diagnostic deliberately characterizes the working layers so the break stays *isolated*. All
of the following pass for real, with zero quarantines:

- **Services:** `PairingService`, `PreferenceStateService`, `ScoringService`, `SessionService`,
  `DecisionEventService`, `SortResultShareService`, and `SortResultService`'s own logic
  (create/finalize/supersede/override) — all green at the unit tier (Tasks 3–6).
- **The decision → preference seam:** a real triage decision driven through the un-mocked
  `POST /api/sessions/[id]/decisions` persists a `CollectionPreferenceItem` in the correct
  bucket (integration, Task 12 case 1).
- **The triage / compare / results UI interactions:** tier-button POSTs, compare card choices
  (incl. Tie/Skip), results tier sections, the most-loved hero, and full ranking — all green
  (unit Task 10; e2e Task 13).
- **Authn/authz** across the sort-results surface — green (existing integration authz suite).

**The break is isolated to the preference → result *materialization* seam and its missing UI
entry point.** Decisions are recorded correctly and preferences are computed correctly; what is
missing is the wiring that turns those preferences into a populated `SortResult`, plus any live
control to trigger it. Findings 2–5 are adjacent stubs on the same result lifecycle; Finding 6
is the upstream flow gap.

---

## Repair-strategy starting point

Pick **one canonical populating path and make the live POST and a reachable UI affordance use
it.** The orphaned `SortResultService.createDraftResult` is already the complete, correct
implementation (reads preferences, ranks by score, materializes items) — promote it to canonical:
instantiate it in `POST /api/sort-results` (replacing the raw `SortResultRepository.create` call),
and give the session a reachable affordance to invoke it (revive `SessionCompleteScreen` on a
session route, or add a "see your results" control on the session-detail page). Treat
`ResultController.createDraftResult` (the wired-but-stubbed path) as the thing to either delegate
to the service or delete, so there is a single source of truth rather than two half-paths. With
the populating path live, clear the adjacent stubs in the same lifecycle: route supersede to the
complete `SortResultService.supersedeResult` (Finding 2); add a repo `delete` and real
`deleteResultItem` / `deleteResult` hard deletes (Findings 3 and 3a — both ride the same missing
repo delete path); implement `ShareController.listShares(resultId)` against a
`findByResult` scope (Finding 4); relabel `ItemCard` low → "Onward" (Finding 5, purses-xca); and
have `StartSessionForm` push to `/triage` (Finding 6). Each repair flips its tripwire from
green-as-expected-failure to an **error**, which is the regression guard: the failing-as-expected
test forces the engineer to promote it to a plain passing `it`/`test`, so the fix cannot land
without a now-real green test proving it.

---

## How to read the tripwires

These are **RED-first** pins, not ordinary failing tests:

- `test.fails(...)` / `it.fails(...)` assert the **intended** (not-yet-true) behavior. Vitest
  inverts them: because the body *does* fail today, the test counts as **green** ("expected
  failure"). The suite is honestly green while the bug is honestly pinned.
- The instant the underlying layer is fixed, the body **passes** — and a `*.fails` whose body
  passes is itself an **ERROR**. That error is the signal to **promote** the tripwire to a plain
  `it(...)`/`test(...)`, leaving a real green test that guards the fix. A pin can never be
  silently left behind.
- `test.fixme(...)` (the e2e flow gap) is **skipped**, not run — used where asserting the intended
  journey would require driving behavior the code does not yet perform. Remove `.fixme` once the
  flow lands.
- Each tripwire was proven RED by temporarily flipping it to a plain `it`/`test` and capturing the
  real assertion failure (recorded in the per-task reports), then restored — so none is a
  tautology that would pass against the bug.
