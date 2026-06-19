# Sort-flow Diagnostic Test Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Every subagent prompt that explores code MUST run graphify first** (`graphify query/explain/path`) before reading raw files (repo hook policy).

**Goal:** Build a characterize-only diagnostic test suite for the Sorting Session / Triage / Compare / Results flows that localizes the known break.

**Architecture:** Three tiers — vitest unit (services + sort-results route handlers, mock only auth/db/Blob), DB-backed integration (`src/lib/db/*.integration.test.ts`, `RUN_DB_TESTS=1`, ephemeral Postgres), Playwright e2e (journeys + routing/images/auth). Tests assert *intended* behavior; failures are the deliverable (a localization map). **No production-code fixes** — where code is wrong, the test pins current behavior and the divergence is reported.

**Tech Stack:** Next.js App Router, vitest, Playwright, Drizzle, Neon/Postgres, `@vercel/blob`.

## Global Constraints

- **Characterize-only.** No edits to `src/` production code. If an assertion of *intended* behavior fails, change the test to pin *actual* behavior, add a `// DIVERGENCE:` comment naming intended-vs-actual, and record it in the diagnosis log (Task 14). Never fix the product.
- **Mock only true boundaries** in unit tests: `@/lib/auth` (getSession/requireAuth), `@/lib/db` (getDb), `@vercel/blob`. Never mock the unit under test or your own service/repo layers in integration.
- **Integration gate:** every `src/lib/db/*.integration.test.ts` wraps its suite in `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;` and uses `e2e/fixtures/db` (`getTestDb`/`resetDb`/`closeDb`) + `e2e/fixtures/seed`.
- **E2E** uses `seedBaseline` + a seed helper, intercepts `**/photos/**/file` with a local fixture, and navigates **slug + number** URLs (`/collections/{slug}/sort/{sessionNumber}/...`), never raw ULIDs.
- **Test names are behavioral (DAMP):** the name states the contract (`"creates a result with zero items — DIVERGENCE: live route skips materialization"`), never `test 3`.
- **CI:** unit/route → `npm run test:ci`; integration → `db-tests` job (`RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`); e2e → the change-gated `e2e:` job. No new CI wiring needed — new files land in existing tiers.

## Confirmed-at-read diagnosis (the executor + reviewer should expect these)

- `POST /api/sort-results` (`src/app/api/sort-results/route.ts`) calls `SortResultRepository.create({status:"draft"})` directly — it does **not** call `SortResultService.createDraftResult`, so **no `SortResultItem`s are materialized**. Expected: Results empty via the live path.
- `SortResultService.createDraftResult` (the correct, populating path) appears to have no live caller (`purses-r7p`: only `SessionCompleteScreen`, dead).
- `DELETE /api/sort-results/[id]/items/[rid]` → `ResultItemController.deleteResultItem()` is a no-op stub (returns 200, deletes nothing).
- `POST /api/items/[id]/purge` no-op (out of these flows' scope; ignore).

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
- [ ] **`route.test.ts` (POST) cases:** `"401 unauthenticated"`; `"400 when collectionId or name missing"`; `"403 when collection access denied"` (mock guard → NextResponse 403); `"201 forces curatorId from session and status draft"`; **`"creates the result with ZERO SortResultItems — DIVERGENCE: live POST skips SortResultService.createDraftResult materialization"`** — assert the item repo's `create` is never invoked by this route. This is the headline diagnostic.
- [ ] **`[id]/route.test.ts` cases:** GET/PATCH/DELETE each: `401`, `403/404` via `requireApiResultAccess`, success shape; PATCH `400` invalid JSON.
- [ ] **Run** `npx vitest run src/app/api/sort-results/route.test.ts src/app/api/sort-results/\[id\]/route.test.ts`. **Commit** `test(sort): sort-results POST + [id] route coverage — pins empty-result divergence`.

## Task 8: `sort-results` finalize / supersede / items / items[rid] / reset route tests

**Files:** Create `finalize/route.test.ts`, `supersede/route.test.ts`, `items/route.test.ts`, `items/[rid]/route.test.ts`, `items/[rid]/reset/route.test.ts`. Same mock pattern; all gated by `requireApiResultAccess`; children also belongs-to-parent (`item.sortResultId !== id → 404`).
- [ ] **Cases per route:** `401`; `403/404` (guard); belongs-to-parent `404` for `[rid]` routes (item from another result); success status/shape; **`items/[rid] DELETE`: `"returns 200 but deletes nothing — DIVERGENCE: deleteResultItem is a no-op stub"`** (assert handler returns 200; note no deletion).
- [ ] **Run** the five files. **Commit** `test(sort): sort-results finalize/supersede/items/reset route coverage`.

## Task 9: `sort-results` shares route tests

**Files:** Create `shares/route.test.ts`, `shares/[sid]/route.test.ts`. Same pattern; `requireApiResultAccess` + belongs-to-parent (`share.sortResultId !== id → 404`).
- [ ] **Cases:** GET list (`401`/`403`/`404`, success); POST create (`401`/`403`, `400` invalid JSON, `201` shape); `[sid]` GET/PATCH/DELETE (`401`/`403`/`404`, belongs-to-parent `404`, success).
- [ ] **Run**; **Commit** `test(sort): sort-results shares route coverage`.

## Task 10: Compare / Triage / Results component-interaction gaps

**Files:** First read the existing page tests (`.../sort/[sessionNumber]/triage/page.test.tsx`, `compare/page.test.tsx`, `results/[resultNumber]/page.test.tsx`) and `src/features/sorting/CompareChoice.test.tsx`. **Only add tests for interactions not already covered** (YAGNI on duplicates): triage tier-button tap fires the decision with the right `result`; compare card/image tap chooses that item (vs Tie/Skip); results renders each tier section + the Onward (low) section + most-loved hero. Mock the fetch boundary.
- [ ] **Run** the touched test files. **Commit** `test(sort): fill compare/triage/results interaction gaps`. (If existing coverage is already complete, record that in Task 14 and skip — note it explicitly, don't invent redundant tests.)

## Task 11: Add `seedSortScenario` fixture

**Files:** MODIFY `e2e/fixtures/seed.ts`. Add `seedSortScenario(ownerId)` that extends `seedTriageScenario`: seed a collection (slug) + **3 items each with a hero photo** + an active session, **and** pre-seed `CollectionPreferenceItem` rows for the owner across buckets (so Results/Compare have data without a live sort). Return `{collectionId, slug, sessionNumber, itemIds}`. Mirror `seedTriageScenario`; use `CollectionPreferenceItemRepository.create`. Also seed a `SortResult` via `SortResultService.createDraftResult` (the correct path) and return its `resultNumber`, so the results e2e can load a populated result regardless of the live-route bug.
- [ ] **Run** `RUN_DB_TESTS=1 npx tsx e2e/fixtures/seed.ts` (extend the `require.main` block to smoke `seedSortScenario`). **Commit** `test(sort): seedSortScenario e2e fixture`.

## Task 12: `sort-pipeline` DB integration test (the seam diagnostic)

**Files:** Create `src/lib/db/sort-pipeline.integration.test.ts`. Mirror `triage-decision.integration.test.ts` (`describeDb`, `resetDb`, `seedBaseline`, real repos, mock only auth+db). Use real `PreferenceStateService`, `ScoringService`, `SortResultService`, repos.
- [ ] **Cases (assert the intended end-to-end contract):**
  1. `"triage decisions persist preferences with the right buckets"` — seed collection+items+session; record triage via `DecisionEventRepository`/route; `PreferenceStateService.recalculate`; assert `CollectionPreferenceItem` rows + buckets.
  2. `"pairwise decisions update preference scores"` — record pairwise; recalc; assert score movement (mirror ScoringService expectations).
  3. `"SortResultService.createDraftResult materializes one item per preference"` — call it; assert `SortResultItem` rows exist, ranked by score.
  4. **`"the live POST /api/sort-results path yields a result with ZERO items — DIVERGENCE (purses-r7p): route bypasses createDraftResult"`** — drive the real `POST /api/sort-results` handler, then query `SortResultItemRepository.findByResult(newId)` → assert `[]`. Pins the break end-to-end.
- [ ] **Run** `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/sort-pipeline.integration.test.ts`. **Commit** `test(sort): decision→preference→result pipeline integration — pins empty-result seam`.

## Task 13: E2E journeys (session / triage / compare / results)

**Files:** Create `e2e/sort-session.spec.ts`, `e2e/compare.spec.ts`, `e2e/results.spec.ts`. Mirror `sort-images.spec.ts` (`seedBaseline` + `seedSortScenario`, intercept `**/photos/**/file`, slug/number URLs, storageState auth from config).
- [ ] **session spec:** start at `/collections/{slug}/sort/new` (or the start form) → lands on triage at `/sort/{sessionNumber}/triage`; reload preserves session; unauth `goto` → redirect to `/login`.
- [ ] **triage spec:** hero image visible; tap a tier button → URL/state advances to next item; reload shows the item no longer pending; graceful state when an item has no photo.
- [ ] **compare spec:** `/sort/{sessionNumber}/compare` shows "Which do you love more?"; tap a card chooses it; Tie/Skip present as secondary; gentle progress text visible; after a tap the next pair (or completion) appears.
- [ ] **results spec:** load the seeded populated result at `/collections/{slug}/results/{resultNumber}` → tier sections + hero images render + Onward section present. **Then** the divergence check: start a *fresh* sort via the live UI and assert Results is empty (the live path produces no items) — `// DIVERGENCE` + record in Task 14.
- [ ] **Run** `npx playwright test e2e/sort-session.spec.ts e2e/compare.spec.ts e2e/results.spec.ts`. **Commit** `test(sort): e2e journeys for session/triage/compare/results (purses-7dd)`.

## Task 14: Diagnosis report + full-suite run

**Files:** Create `docs/diagnosis/2026-06-19-sort-flow-findings.md`.
- [ ] Run the whole suite across tiers: `npm run test:ci`, `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db`, `npx playwright test`.
- [ ] Write the report **outside-in**: for each failing/diverging test, record `symptom → file:test → layer → likely cause`, grouped by flow. Lead with the confirmed `r7p` empty-result break (route bypasses `createDraftResult`) and the `deleteResultItem` no-op. End with a one-paragraph **repair-strategy starting point** (which layer to fix first). This file + the PR body are the deliverable.
- [ ] **Commit** `docs(diagnosis): sort-flow failure localization map`.

---

## Self-review

**Spec coverage:** unit (Tasks 1–6 services, 7–9 routes, 10 components) ✓; integration pipeline (12) ✓; e2e journeys + routing/images/auth (13) ✓; characterize-only + divergence handling (Global Constraints + Tasks 7/8/12/13/14) ✓; CI tiers (Global Constraints) ✓; diagnosis deliverable (14) ✓; fixtures (11) ✓. Out-of-scope items excluded.

**Placeholders:** none — every task names exact files, the mirror pattern, concrete `it` cases with arrange/act/assert intent, run command, and expected outcome (incl. predicted divergences). Task 10 explicitly forbids inventing redundant tests.

**Type consistency:** service constructor signatures, repo method names (`findByCollection`, `findByItem`, `findByResult`, `findDraft`, `findActive`, `findByToken`, `create`, `update`), and the `CollectionPreferenceItem`/`SortResultItem` field names (`score`, `rankBucket`, `comparisonCount`, `computedRank`, `computedBucket`, `manualRank`, `manualBucket`) are used consistently and match the read sources.
