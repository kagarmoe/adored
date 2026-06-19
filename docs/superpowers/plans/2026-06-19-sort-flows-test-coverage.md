# Sort-flow Diagnostic Test Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Every subagent prompt that explores code MUST run graphify first** (`graphify query/explain/path`) before reading raw files (repo hook policy).

**Goal:** Build a characterize-only diagnostic test suite for the Sorting Session / Triage / Compare / Results flows that localizes the known break.

**Architecture:** Three tiers — vitest unit (services + sort-results route handlers, mock only auth/db/Blob), DB-backed integration (`src/lib/db/*.integration.test.ts`, `RUN_DB_TESTS=1`, ephemeral Postgres), Playwright e2e (journeys + routing/images/auth). Tests assert *intended* behavior and are left **RED at the break** (quarantined via `test.fails()`/`it.skip` so required CI stays green); the red tests are the localization map AND the repair's regression guard. **No production-code fixes** — never rewrite a test to assert broken behavior as correct.

**Tech Stack:** Next.js App Router, vitest, Playwright, Drizzle, Neon/Postgres, `@vercel/blob`.

## Global Constraints

- **Characterize-only = no `src/` production edits. RED-first:** assert *intended* behavior; where the code is broken, leave the test FAILING but quarantined — mark it `test.fails()` (vitest 1.6.1: green while the body fails, **errors when the body passes** = the repair tripwire) or `it.skip` with a `// BROKEN(purses-r7p): intended X, actual Y` tag. **Never rewrite a test to assert broken behavior as if correct** (that buries the diagnosis and inverts the guard). Record each in the diagnosis log (Task 14). Never fix the product.
- **Mock only true boundaries** in unit tests: `@/lib/auth` (getSession/requireAuth), `@/lib/db` (getDb), `@vercel/blob`. Never mock the unit under test or your own service/repo layers in integration.
- **Integration gate:** every `src/lib/db/*.integration.test.ts` wraps its suite in `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;` and uses `e2e/fixtures/db` (`getTestDb`/`resetDb`/`closeDb`) + `e2e/fixtures/seed`.
- **E2E** uses `seedBaseline` + a seed helper, intercepts `**/photos/**/file` with a local fixture, and navigates **slug + number** URLs (`/collections/{slug}/sort/{sessionNumber}/...`), never raw ULIDs.
- **Test names are behavioral (DAMP) and state the *intended* contract** (`"POST /sort-results materializes one item per preference"`, left `test.fails` while broken), never `test 3` and never a name that asserts the bug as the contract.
- **CI:** unit/route → `npm run test:ci`; integration → `db-tests` job (`RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`); e2e → the change-gated `e2e:` job. No new CI wiring needed — new files land in existing tiers.

## Confirmed diagnosis (verified in spec review — the RED tripwires pin these)

- `POST /api/sort-results` (`route.ts:29`) calls `SortResultRepository.create({status:"draft"})` directly — **no `SortResultItem`s materialized** (empty draft).
- `SortResultService.createDraftResult` (the path that *does* materialize) is **fully orphaned — never instantiated anywhere** in `src/`/`e2e/`. (Not "called only by SessionCompleteScreen.")
- A second method `ResultController.createDraftResult` (`results.ts:23`) sits on the controller wired to the `[id]` routes but is a **stub** (`// TODO: create SortResultItems`) that no route calls.
- `finalize` route → stub `ResultController.finalizeResult` (no items); `supersede` route → `ResultController.supersedeResult` which **throws "not implemented"** (`results.ts:~87`). The correct `SortResultService.supersedeResult` (clones items) is never reached.
- `SessionCompleteScreen` (`tsx:40`) fetches the empty `POST` route and is itself **dead** (no page mounts it; no `complete` route). **Live failure = no `SortResult` is created through any live UI path at all** — Results empty/absent. (The route called directly, as tests do, makes an *empty* result.)
- `items/[rid] DELETE` → `ResultItemController.deleteResultItem()` no-op (returns 200, deletes nothing). `ScoringService` = **10** green unit tests (math sound). `POST /api/items/[id]/purge` no-op (out of scope).

## Execution status & order

- **DONE — do not re-dispatch:** Task 1 `PairingService.test.ts` (6/6) and Task 2 `PreferenceStateService.test.ts` (4/4) — committed; those layers are sound.
- **Seam-first:** the load-bearing RED tripwires come **first** — the live `POST`→empty-items assertion (one assertion added to the **existing** `src/lib/db/sort-results-authz.integration.test.ts`, see Task 12) and the `POST` route test (Task 7). The remaining service/route unit tasks are test-debt repayment around them.

## File structure (all new unless noted)

```
src/server/services/PairingService.test.ts
src/server/services/PreferenceStateService.test.ts
src/server/services/SessionService.test.ts
src/server/services/SortResultService.test.ts
src/server/services/DecisionEventService.test.ts
src/server/services/SortResultShareService.test.ts
src/app/api/sort-results/route.test.ts
src/app/api/sort-results/[id]/route.test.ts
src/app/api/sort-results/[id]/finalize/route.test.ts
src/app/api/sort-results/[id]/supersede/route.test.ts
src/app/api/sort-results/[id]/items/route.test.ts
src/app/api/sort-results/[id]/items/[rid]/route.test.ts
src/app/api/sort-results/[id]/items/[rid]/reset/route.test.ts
src/app/api/sort-results/[id]/shares/route.test.ts
src/app/api/sort-results/[id]/shares/[sid]/route.test.ts
src/lib/db/sort-pipeline.integration.test.ts
e2e/fixtures/seed.ts                      (MODIFY: add seedSortScenario — items+prefs+result)
e2e/sort-session.spec.ts
e2e/compare.spec.ts
e2e/results.spec.ts
docs/diagnosis/2026-06-19-sort-flow-findings.md   (the localization report)
```

**Patterns to mirror (read before writing):**
- Service unit test → `src/server/services/ScoringService.test.ts` (mock repos via `as unknown as I...`, partial fixtures, `toBeCloseTo`).
- Route unit test → `src/app/api/sessions/route.test.ts` (`vi.hoisted` mocks for `getSession`/`getDb`/repos; `postReq = (body) => ({ json: async () => body })`; assert `.status`).
- DB integration → `src/lib/db/triage-decision.integration.test.ts` (`describeDb`, `resetDb`/`seedBaseline`, real repos, mock only auth+db).
- E2E → `e2e/sort-images.spec.ts` + `e2e/fixtures/seed.ts` (`seedBaseline`, `seedTriageScenario`, `page.route("**/photos/**/file", ...)`, slug/number URLs).

---

## Task 1: PairingService unit tests

**Files:** Create `src/server/services/PairingService.test.ts`. Mirror `ScoringService.test.ts`.
**Interfaces consumed:** `new PairingService(itemRepo: IItemRepository, preferenceRepo: ICollectionPreferenceItemRepository)`; `selectNextPair(collectionId, curatorId, goal?) → {itemA,itemB}|null`; `prioritizeByGoal(items, goal?) → Item[]`. Mock `itemRepo.findByCollection` and `preferenceRepo.findByCollection`. Build fixtures with `{ id, collectionId, name } as Item` and `{ id, collectionId, curatorId, itemId, score, confidence, rankBucket, comparisonCount } as CollectionPreferenceItem`.

- [ ] **Step 1 — write these `it` cases** (assert intended behavior):
  1. `"returns null with fewer than two items"` — items `[a]`, prefs `[]` → `selectNextPair` resolves `null`.
  2. `"selects the under-compared item first (no-pref scores highest)"` — items `[settled, fresh]`, prefs `[settled: {comparisonCount:12, confidence:0.95}]` (fresh has none → score 1.0; settled → 0) → `pair.itemA.id === "fresh"`.
  3. `"ranks low-comparison + low-confidence items above settled ones"` — items `[a,b,c]`; prefs `a:{comparisonCount:3,confidence:0.6}` (1.0+0.5), `b:{comparisonCount:7,confidence:0.9}` (0.5), `c:{comparisonCount:12,confidence:0.95}` (0) → `itemA.id==="a"`, `itemB.id==="b"`.
  4. `"applies favorites goal bias to a top-bucket item"` — items `[plain, fave]`, both `{comparisonCount:12,confidence:0.95}` (base 0), `fave.rankBucket:"top"`; `goal:"find favorites"` → `itemA.id==="fave"` (+0.5 bias).
  5. `"prioritizeByGoal favorites sorts favorite-status items first"` — items `[{status:"active"},{status:"favorite"}]`, `goal:"favorites"` → first is the favorite.
  6. `"prioritizeByGoal returns items unchanged when goal is null"` — order preserved.
- [ ] **Step 2 — run:** `npx vitest run src/server/services/PairingService.test.ts` — expect PASS (pure logic; confirms pairing layer sound). If any FAIL, record in Task 14, pin actual.
- [ ] **Step 3 — commit:** `test(sort): PairingService unit coverage (purses-7io)`.

## Task 2: PreferenceStateService unit tests

**Files:** Create `src/server/services/PreferenceStateService.test.ts`.
**Interfaces:** `new PreferenceStateService(preferenceRepo, scoringService)`; `recalculatePreferences(collectionId, curatorId)`; `getItemPreferences(...)`. Mock `scoringService.computePreferences` (returns `[{itemId,score,confidence,rankBucket,comparisonCount}]`) and `preferenceRepo` (`findByCollection`, `create`, `update`).

- [ ] **Step 1 — cases:**
  1. `"creates a row for a newly-scored item"` — `computePreferences→[{itemId:"a",...,rankBucket:"top"}]`; `findByCollection` returns `[]` then `[created]` → `create` called once with the scored fields; `update` not called.
  2. `"updates the existing row instead of creating"` — existing `[{id:"pref-a",itemId:"a"}]` → `update("pref-a", objectContaining({score,confidence,rankBucket,comparisonCount}))`; `create` not called.
  3. `"returns the freshly-read preferences after persisting"` — final `findByCollection` value is returned.
  4. `"getItemPreferences passes through to the repo"`.
- [ ] **Step 2 — run** `…PreferenceStateService.test.ts` — expect PASS. Record divergences.
- [ ] **Step 3 — commit** `test(sort): PreferenceStateService unit coverage`.

## Task 3: SessionService unit tests

**Files:** Create `src/server/services/SessionService.test.ts`. Mock `ISessionRepository` (`findActive`, `create`, `findById`, `findByCollection`, `update`).
- [ ] **Cases:**
  1. `"creates a session when no active one exists"` — `findActive→null` → `create({collectionId,curatorId,goal})` called, returns it.
  2. `"throws when an active session already exists for the curator"` — `findActive→{id}` → `createSession` rejects (one-active-per-curator invariant).
  3. `"pause/resume/complete/abandon set the right status"` — four cases asserting `update(id, objectContaining({status:"paused"|"active"|"completed"|"abandoned"}))`.
  4. `"getActiveSession / getCollectionSessions / getSession pass through"`.
- [ ] **Run** `…SessionService.test.ts` — expect PASS. **Commit** `test(sort): SessionService unit coverage`.

## Task 4: SortResultService unit tests (the materialization contract)

**Files:** Create `src/server/services/SortResultService.test.ts`. Mock `ISortResultRepository`, `ISortResultItemRepository`, `ICollectionPreferenceItemRepository`.
- [ ] **Cases:**
  1. `"createDraftResult materializes one ranked item per preference, sorted by score desc"` — prefs `[{itemId:"a",score:0.9,rankBucket:"top"},{itemId:"b",score:0.4,rankBucket:"medium"}]` → `sortResultItemRepo.create` called twice: `(a, computedRank:0, computedBucket:"top")`, `(b, computedRank:1, computedBucket:"medium")`.
  2. `"createDraftResult with no preferences creates a result but zero items"` — prefs `[]` → result created, `sortResultItemRepo.create` never called. (Characterizes the empty-pipeline case.)
  3. `"finalizeResult sets status finalized + finalizedAt"`.
  4. `"supersedeResult clones computed items into a new draft named '(Revision)'"` — old items copied with `computedRank/computedBucket` preserved.
  5. `"supersedeResult returns null when the source is absent"`.
  6. `"setManualOverride / resetManualOverride write manual fields"` (override sets, reset nulls).
- [ ] **Run** `…SortResultService.test.ts` — expect PASS (the service itself is correct; the bug is that the route doesn't call it). **Commit** `test(sort): SortResultService unit coverage`.

## Task 5: DecisionEventService unit tests

**Files:** Create `src/server/services/DecisionEventService.test.ts`. Mock `IDecisionEventRepository`.
- [ ] **Cases:** `"recordTriageDecision creates a triage event with {itemId,result}"`; `"recordPairwiseDecision creates a pairwise_compare event with {itemAId,itemBId,result}"`; `"getSessionDecisions / getDecisionEvent pass through"`.
- [ ] **Run**; expect PASS. **Commit** `test(sort): DecisionEventService unit coverage`.

## Task 6: SortResultShareService unit tests

**Files:** Create `src/server/services/SortResultShareService.test.ts`. Mock the three repos. Note `createShare` uses `crypto.randomBytes` (real, fine) — assert a 32-char hex token shape, not a fixed value.
- [ ] **Cases:**
  1. `"createShare without expiry stores a hex token and no expiresAt"` — token matches `/^[0-9a-f]{32}$/`, `expiresAt` undefined.
  2. `"createShare with expiryDays sets expiresAt in the future"` — `expiresAt` ~ now + days (assert `> Date.now()`).
  3. `"viewSharedResult returns null for unknown / revoked / expired tokens"` (three cases).
  4. `"viewSharedResult maps items to the public shape"` — returns `{resultName, items:[{itemId,computedRank,computedBucket,manualRank,manualBucket}]}`.
  5. `"isShareValid false for revoked/expired, true otherwise"`.
- [ ] **Run**; expect PASS. **Commit** `test(sort): SortResultShareService unit coverage`.

## Task 7: `sort-results` POST + `[id]` route tests (reveals the empty-result break)

**Files:** Create `src/app/api/sort-results/route.test.ts` and `src/app/api/sort-results/[id]/route.test.ts`. Mirror `sessions/route.test.ts` `vi.hoisted` style; mock `getSession`, `getDb`, `requireApiCollectionAccess`/`requireApiResultAccess` (mock `@/server/dal/collection-access`) and the repos used.
- [ ] **`route.test.ts` (POST) cases:** `"401 unauthenticated"`; `"400 when collectionId or name missing"`; `"403 when collection access denied"` (mock guard → NextResponse 403); `"201 forces curatorId from session and status draft"`; **RED tripwire — `"POST materializes one SortResultItem per preference"`** via `test.fails()` (the route's item-repo `create` is never invoked today → fails now, flips green when the route is wired to materialize). Name it for the INTENDED behavior, not the bug.
- [ ] **`[id]/route.test.ts` cases:** GET/PATCH/DELETE each: `401`, `403/404` via `requireApiResultAccess`, success shape; PATCH `400` invalid JSON.
- [ ] **Run** `npx vitest run src/app/api/sort-results/route.test.ts src/app/api/sort-results/\[id\]/route.test.ts`. **Commit** `test(sort): sort-results POST + [id] route coverage — pins empty-result divergence`.

## Task 8: `sort-results` finalize / supersede / items / items[rid] / reset route tests

**Files:** Create `finalize/route.test.ts`, `supersede/route.test.ts`, `items/route.test.ts`, `items/[rid]/route.test.ts`, `items/[rid]/reset/route.test.ts`. Same mock pattern; all gated by `requireApiResultAccess`; children also belongs-to-parent (`item.sortResultId !== id → 404`).
- [ ] **Cases per route:** `401`; `403/404` (guard); belongs-to-parent `404` for `[rid]` routes; success status/shape. **RED tripwires (`test.fails()`, named for intended behavior):** `supersede` → `"supersede returns 201 and clones the result's items"` (route runs the stub `ResultController.supersedeResult` → returns 500 today, so it fails); `items/[rid] DELETE` → `"DELETE removes the result item"` (no-op 200 today → assert the row is gone / repo `delete` invoked, fails today).
- [ ] **Run** the five files. **Commit** `test(sort): sort-results finalize/supersede/items/reset route coverage`.

## Task 9: `sort-results` shares route tests

**Files:** Create `shares/route.test.ts`, `shares/[sid]/route.test.ts`. Same pattern; `requireApiResultAccess` + belongs-to-parent (`share.sortResultId !== id → 404`).
- [ ] **Cases:** GET list (`401`/`403`/`404`, success); POST create (`401`/`403`, `400` invalid JSON, `201` shape); `[sid]` GET/PATCH/DELETE (`401`/`403`/`404`, belongs-to-parent `404`, success).
- [ ] **Run**; **Commit** `test(sort): sort-results shares route coverage`.

## Task 10: Compare / Triage / Results component-interaction gaps

**Files:** First read the existing page tests (`.../sort/[sessionNumber]/triage/page.test.tsx`, `compare/page.test.tsx`, `results/[resultNumber]/page.test.tsx`) and `src/features/sorting/CompareChoice.test.tsx`. **Only add tests for interactions not already covered** (YAGNI on duplicates): triage tier-button tap fires the decision with the right `result`; compare card/image tap chooses that item (vs Tie/Skip); results renders each tier section + the Onward (low) section + most-loved hero. Mock the fetch boundary.
- [ ] **Run** the touched test files. **Commit** `test(sort): fill compare/triage/results interaction gaps`. (If existing coverage is already complete, record that in Task 14 and skip — note it explicitly, don't invent redundant tests.)

## Task 11: Add `seedSortScenario` fixture

**Files:** MODIFY `e2e/fixtures/seed.ts`. Add `seedSortScenario(ownerId)` that extends `seedTriageScenario`: seed a collection (slug) + **3 items each with a hero photo** + an active session, **and** pre-seed `CollectionPreferenceItem` rows for the owner across buckets (so Results/Compare have data without a live sort). Return `{collectionId, slug, sessionNumber, itemIds}`. Mirror `seedTriageScenario`; use `CollectionPreferenceItemRepository.create`. Also seed a `SortResult` via `SortResultService.createDraftResult` (the correct path) and return its `resultNumber`. **This is renderer-only scaffolding** — it deliberately bypasses the broken live route, so the populated-results e2e proves presentation, not the seam (the seam is pinned in Task 12).
- [ ] **Run** `RUN_DB_TESTS=1 npx tsx e2e/fixtures/seed.ts` (extend the `require.main` block to smoke `seedSortScenario`). **Commit** `test(sort): seedSortScenario e2e fixture`.

## Task 12: DB integration — the seam tripwire (always-on tier)

**The headline RED tripwire lives here** (the e2e job is skippable; this `db-tests` tier always runs). **Do NOT duplicate setup** — add the seam assertion to the **existing** `src/lib/db/sort-results-authz.integration.test.ts`, which already drives the real `POST /api/sort-results` un-mocked and imports `SortResultItemRepository`. Put the remaining new cases in `src/lib/db/sort-pipeline.integration.test.ts` (mirror `triage-decision.integration.test.ts`: `describeDb`, `resetDb`, `seedBaseline`, real repos, mock only auth+db).
- [ ] **Seam tripwire (in the existing authz file):** **RED `test.fails()`** — `"live POST /api/sort-results materializes one SortResultItem per preference"`: after the existing live-POST 201, assert `SortResultItemRepository.findByResult(newId)` is non-empty. Fails today (`[]`); flips green when the route is fixed. Name it for the intended behavior, not "zero items".
- [ ] **New pipeline cases (`sort-pipeline.integration.test.ts`):**
  1. `"triage decision persists a preference in the right bucket"` — assert **persistence + bucket direction**, NOT exact scores (ScoringService's 10 unit tests own the arithmetic — don't re-derive).
  2. `"createDraftResult materializes one item per preference, ranked by score"` — calls `SortResultService.createDraftResult` directly. **Label: characterizes the intended-but-unwired service path** (the service is orphaned — a future-repair target, not the live-seam guard above).
- [ ] **Run** `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`. **Commit** `test(sort): seam tripwire (live POST → items) + pipeline integration`.

## Task 13: E2E journeys (session / triage / compare / results)

**Files:** Create `e2e/sort-session.spec.ts`, `e2e/compare.spec.ts`, `e2e/results.spec.ts`. Mirror `sort-images.spec.ts` (`seedBaseline` + `seedSortScenario`, intercept `**/photos/**/file`, slug/number URLs, storageState auth from config).
- [ ] **session spec:** start at `/collections/{slug}/sort/new` (or the start form) → lands on triage at `/sort/{sessionNumber}/triage`; reload preserves session; unauth `goto` → redirect to `/login`.
- [ ] **triage spec:** hero image visible; tap a tier button → URL/state advances to next item; reload shows the item no longer pending; graceful state when an item has no photo.
- [ ] **compare spec:** `/sort/{sessionNumber}/compare` shows "Which do you love more?"; tap a card chooses it; Tie/Skip present as secondary; gentle progress text visible; after a tap the next pair (or completion) appears.
- [ ] **results spec (renderer-only — label it):** load the **seeded** populated result at `/collections/{slug}/results/{resultNumber}` → tier sections + hero images + Onward render. Comment that this proves presentation on seeded data and carries **zero diagnostic signal about the break**. Do NOT attempt "fresh sort via live UI → empty" — no live UI path creates a result (`SessionCompleteScreen` is dead). If no reachable results-generation affordance exists, record that observation in Task 14; the authoritative seam proof is Task 12's integration tripwire.
- [ ] **Run** `npx playwright test e2e/sort-session.spec.ts e2e/compare.spec.ts e2e/results.spec.ts`. **Commit** `test(sort): e2e journeys for session/triage/compare/results (purses-7dd)`.

## Task 14: Diagnosis report + full-suite run

**Files:** Create `docs/diagnosis/2026-06-19-sort-flow-findings.md`.
- [ ] Run the whole suite across tiers: `npm run test:ci`, `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`, `npx playwright test`.
- [ ] Write the report **outside-in**, deriving each cause **from the actual test run** (not copied from this plan): for each RED/quarantined test, record `symptom → file:test → layer → cause`, grouped by flow. Lead with the result-creation break — name the **two orphaned populating paths** (`SortResultService` never instantiated; `ResultController.createDraftResult` stubbed), `supersede` throwing, the `deleteResultItem` no-op, and the dead `SessionCompleteScreen` (so no live path creates a result). End with a one-paragraph **repair-strategy starting point** (which path to make canonical + wire first). This file + the PR body are the deliverable.
- [ ] **Commit** `docs(diagnosis): sort-flow failure localization map`.

---

## Self-review

**Spec coverage:** unit (Tasks 1–6 services, 7–9 routes, 10 components) ✓; integration pipeline (12) ✓; e2e journeys + routing/images/auth (13) ✓; characterize-only + RED-first quarantine (Global Constraints + Tasks 7/8/12/13/14) ✓; seam tripwire on the always-on integration tier (12) ✓; CI tiers (Global Constraints) ✓; diagnosis deliverable (14) ✓; fixtures (11) ✓. Out-of-scope items excluded.

**Placeholders:** none — every task names exact files, the mirror pattern, concrete `it` cases with arrange/act/assert intent, run command, and expected outcome (incl. predicted RED tripwires + their `test.fails`/`it.skip` quarantine). Task 10 explicitly forbids inventing redundant tests; Task 12 dedups against the existing authz integration test; Tasks 1–2 are marked DONE.

**Type consistency:** service constructor signatures, repo method names (`findByCollection`, `findByItem`, `findByResult`, `findDraft`, `findActive`, `findByToken`, `create`, `update`), and the `CollectionPreferenceItem`/`SortResultItem` field names (`score`, `rankBucket`, `comparisonCount`, `computedRank`, `computedBucket`, `manualRank`, `manualBucket`) are used consistently and match the read sources.
