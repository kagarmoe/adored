# Sort-flow Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the sessions→sort→results workflow so a curator who sorts reaches a populated results page, fixing all 8 diagnostic tripwires via canonical TDD.

**Architecture:** Wire the live routes to the complete-but-orphaned `SortResultService` for the broken lifecycle mutations (create/supersede/delete), add two repository delete methods, repair the inert session-detail trigger card with a small client component, and fix three peripheral breaks (listShares scoping, Release→Onward label, start-form→triage). Working `get`/`update`/`finalize` stay on `ResultController` (not migrated).

**Tech Stack:** Next.js 14 App Router, Drizzle ORM + Neon/Postgres, NextAuth v4 (JWT), Vitest (unit + RUN_DB_TESTS integration), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-19-sort-flow-repair-design.md` (rev-3). **Diagnosis:** `docs/diagnosis/2026-06-19-sort-flow-findings.md`.

## Global Constraints

- **Acceptance bar (binding):** (1) **0** `it.fails`/`test.fails`/`test.fixme` in the sort domain — every tripwire promoted to a passing real test; (2) **avoid mocking** — un-mocked DB integration + Playwright e2e are the authoritative proof of each fix; mock only true boundaries (auth session, `fetch`/network, Blob); (3) all tests pass (`test:ci` + `db-tests` + `e2e`); (4) the app works, demonstrated in Playwright e2e (start → triage AND compare → trigger → populated results).
- **Canonical owner:** `SortResultService` owns `createDraftResult`/`supersedeResult`/`deleteResult`/`deleteResultItem`. `ResultController.getResult`/`updateResult`/`finalizeResult` and `ResultItemController.listResultItems`/`getResultItem`/`updateResultItem`/`resetResultItem` STAY — do not migrate them.
- **supersede** is finalized-only → non-finalized **409**, absent **404**, else **201** + cloned items.
- **deleteResult** is draft-only → finalized **409**, absent **404**, else **200**. Children-first ordered delete (`deleteByResult` then `delete`), **no transaction** (the codebase uses none; single-curator draft delete is FK-safe + recoverable). Hard delete (drafts are derived/re-creatable).
- **Route status-mapping:** the supersede/delete routes today map any non-`Unauthorized` error → 500; the repair maps service `null`→404 and the status-guard rejection→409.
- **TDD, no shortcuts:** every behavior gets a fresh failing test FIRST (run + capture the failure), then minimal code, then refactor. Promoting an `it.fails`/`test.fails` tripwire (→ plain `it`/`test`) must make it genuinely RED before production code. Where the existing tripwire is a coarse mock assertion, the authoritative proof is an additional **un-mocked** test (DB integration / e2e).
- **Authz unchanged:** keep the existing `requireApiCollectionAccess`/`requireApiResultAccess`/belongs-to-parent guards in every route; the repair only changes the success-path wiring and error status-mapping.
- **Tone (TONE.md):** results trigger copy is from the person's side, affirming, reversible. No gamification, no "Release"/letting-go framing in the sort/results UI.
- **Commit on THIS branch (`fix/sort-flow-repair`); never create/switch branches.**

## The 8 tripwires (the 0-it.fails gate) → owning task

| Tripwire | File:line | Task |
|---|---|---|
| POST materialize (unit) | `src/app/api/sort-results/route.test.ts:116` (`test.fails`) | 1 |
| live POST→items seam (integration) | `src/lib/db/sort-results-authz.integration.test.ts:306` (`it.fails`) | 1 |
| supersede 201+clone | `src/app/api/sort-results/[id]/supersede/route.test.ts:100` (`it.fails`) | 2 |
| DELETE removes result | `src/app/api/sort-results/[id]/route.test.ts:182` (`it.fails`) | 3 |
| DELETE removes result item | `src/app/api/sort-results/[id]/items/[rid]/route.test.ts:204` (`it.fails`) | 4 |
| listShares scoped | `src/app/api/sort-results/[id]/shares/route.test.ts:76` (`it.fails`) | 5 |
| Release→Onward (purses-xca) | `src/app/collections/[id]/results/[resultNumber]/page.test.tsx:150` (`it.fails`) | 6 |
| start-form→triage | `e2e/sort-session.spec.ts:115` (`test.fixme`) | 7 |

## File Structure

- `src/server/repositories/SortResultRepository.ts` — add `delete(id)` to `ISortResultRepository`; add `delete(id)` + `deleteByResult(sortResultId)` to `ISortResultItemRepository`.
- `src/server/repositories/implementations/SortResultRepository.ts` + `SortResultItemRepository.ts` — implement the new methods.
- `src/server/services/SortResultService.ts` — add `deleteResult(id)`, `deleteResultItem(id)`; add finalized-only guard to `supersedeResult`.
- `src/app/api/sort-results/route.ts` — POST → `createDraftResult`.
- `src/app/api/sort-results/[id]/route.ts` — DELETE → `deleteResult` + 409/404 mapping.
- `src/app/api/sort-results/[id]/supersede/route.ts` — → `supersedeResult` + 409/404/201 mapping.
- `src/app/api/sort-results/[id]/items/[rid]/route.ts` — DELETE → `deleteResultItem`.
- `src/app/api/sort-results/[id]/shares/route.ts` + `src/server/api/shares.ts` — listShares(resultId).
- `src/server/api/results.ts` + `result-items.ts` — remove the now-dead stub methods.
- `src/features/items/ItemCard.tsx` + the session-detail page bucket grid — `Release`→`Onward`.
- `src/features/sorting/StartSessionForm.tsx` — push to `/triage`.
- `src/app/collections/[id]/sort/[sessionNumber]/page.tsx` + a new client trigger component — repair the inert card.
- `src/features/sessions/SessionCompleteScreen.tsx` (+ its test) — DELETE (dead code).
- Tests: the 8 tripwire files (promote) + new un-mocked DB integration assertions in `src/lib/db/`.

**Implementer note (every task):** `graphify-out/graph.json` exists — run `graphify query "<question>"` to orient BEFORE reading source, then Read the exact files. Reuse each test file's existing setup (mock pattern, `describeDb` gate, `resetDb`); do not invent new harness machinery. DB integration tests follow the recipe in the existing `src/lib/db/*.integration.test.ts` files: gate with `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip`, mock ONLY `@/lib/auth` (flat-replace form `vi.mock("@/lib/auth", () => ({ getSession, requireAuth }))`) and `@/lib/db`, seed REAL FK parents via repositories, run with `npm run test:db -- <substring>`.

---

### Task 1: Result materialization — POST → `createDraftResult` (+ both-decision-types proof)

**Files:**
- Modify: `src/app/api/sort-results/route.ts` (the POST handler)
- Modify (promote): `src/app/api/sort-results/route.test.ts:116` (`test.fails` → `test`/`it`)
- Modify (promote): `src/lib/db/sort-results-authz.integration.test.ts:306` (`it.fails` → `it`)
- Create: a new un-mocked test in `src/lib/db/sort-pipeline.integration.test.ts` (both-decision-types rank order)
- Remove: dead `ResultController.createDraftResult` stub in `src/server/api/results.ts` only if no route references it (grep first)

**Interfaces:**
- Consumes: `SortResultService.createDraftResult(collectionId: string, curatorId: string, name: string): Promise<SortResult>` (exists, `src/server/services/SortResultService.ts:12`); constructor `new SortResultService(sortResultRepo, sortResultItemRepo, preferenceRepo)`; repos `SortResultRepository`, `SortResultItemRepository`, `CollectionPreferenceItemRepository` (all `(db)`-constructed).
- Produces: POST returns the created `SortResult` (with `.number`) — the UI trigger (Task 8) navigates to `/collections/{slug}/results/{number}`.

- [ ] **Step 1: Promote the integration seam tripwire and watch it go RED.** In `src/lib/db/sort-results-authz.integration.test.ts:306`, change `it.fails(` → `it(`. This test drives the real `POST /api/sort-results` un-mocked and asserts `SortResultItemRepository.findByResult(newId).length > 0`. Run: `npm run test:db -- sort-results-authz`. Expected: **FAIL** (POST writes an empty draft → 0 items).

- [ ] **Step 2: Promote the unit POST tripwire and add the missing repo mock.** In `src/app/api/sort-results/route.test.ts:116`, change `test.fails(` → `test(`. The POST handler will construct a 3-repo `SortResultService`; add a `CollectionPreferenceItemRepository` mock alongside the existing `SortResultRepository`/`SortResultItemRepository` mocks (mirror the existing `vi.mock`/`vi.hoisted` pattern in that file) so construction succeeds, and seed one preference so `createDraftResult` materializes ≥1 item. Run: `npx vitest run src/app/api/sort-results/route.test.ts`. Expected: **FAIL** (route calls `SortResultRepository.create` directly; no item created).

- [ ] **Step 3: Add the both-decision-types rank-order proof (un-mocked, RED-first).** In `src/lib/db/sort-pipeline.integration.test.ts`, add a `describeDb` test that: seeds a collection + 2 items + a session (real FK parents via repositories); records a **triage** decision placing BOTH items in the same tier and a **pairwise_compare** decision (winner = itemA, loser = itemB) by driving the real `POST /api/sessions/[id]/decisions` route (see `src/app/api/sessions/[id]/decisions/route.ts` for the `{type, decision}` payload — read `ScoringService.computePreferences` for the exact `decision` shape of `triage` and `pairwise_compare`); then drives `POST /api/sort-results`; then loads items via `SortResultItemRepository.findByResult` and asserts:
```ts
const winner = items.find((i) => i.itemId === itemA.id)!;
const loser = items.find((i) => i.itemId === itemB.id)!;
expect(winner.computedRank).toBeLessThan(loser.computedRank); // computedRank is 0-based, 0 = best
```
Run: `npm run test:db -- sort-pipeline`. Expected: **FAIL** (empty draft → `winner`/`loser` undefined).

- [ ] **Step 4: Wire the POST route to the service (GREEN).** In `src/app/api/sort-results/route.ts`, replace the direct `SortResultRepository.create({status:"draft"})` call with: construct `new SortResultService(new SortResultRepository(db), new SortResultItemRepository(db), new CollectionPreferenceItemRepository(db))` and `await service.createDraftResult(collectionId, session.user.id, name)`. Keep the existing `requireApiCollectionAccess(db, body.collectionId, session.user.id)` gate and the session-forced `curatorId` (never from the body). Keep the 400-on-missing-fields behavior. Return the created result with its existing status code.

- [ ] **Step 5: Run all three tests to verify GREEN.** Run: `npx vitest run src/app/api/sort-results/route.test.ts` then `npm run test:db -- sort-results-authz sort-pipeline`. Expected: all **PASS**.

- [ ] **Step 6: Remove the dead `ResultController.createDraftResult` stub if unreferenced.** `grep -rn "createDraftResult" src/app src/server` — if no route calls `ResultController.createDraftResult`, delete that stub method from `src/server/api/results.ts` (and any now-unused import). If a route does call it, leave it and note why.

- [ ] **Step 7: Full suite + commit.** Run: `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): materialize result items on POST /api/sort-results (purses-r7p)"
```

---

### Task 2: supersede — finalized-only guard + clone (+ 409/404 route mapping)

**Files:**
- Modify: `src/server/services/SortResultService.ts` (`supersedeResult`)
- Modify: `src/app/api/sort-results/[id]/supersede/route.ts` (wire + status-map)
- Modify (promote): `src/app/api/sort-results/[id]/supersede/route.test.ts:100`
- Create: un-mocked clone assertion in `src/lib/db/sort-pipeline.integration.test.ts`
- Remove: `ResultController.supersedeResult` stub in `src/server/api/results.ts`

**Interfaces:**
- Consumes: `SortResultService.supersedeResult(id: string): Promise<SortResult | null>` (exists, `SortResultService.ts:96`; clones items into a `"(Revision)"` draft, returns `null` if absent). **You will ADD** a finalized-only guard.
- Produces: `POST /[id]/supersede` → 201 + new draft (cloned items) when source is finalized; 409 when not finalized; 404 when absent.

- [ ] **Step 1: Promote the supersede tripwire (RED).** In `src/app/api/sort-results/[id]/supersede/route.test.ts:100`, change `it.fails(` → `it(`. Add the `SortResultItemRepository` + `CollectionPreferenceItemRepository` mocks at construction (the route will build a 3-repo service). The fixture seeds a FINALIZED result. Run: `npx vitest run src/app/api/sort-results/[id]/supersede/route.test.ts`. Expected: **FAIL** (route → `ResultController.supersedeResult` throws → 500, not 201).

- [ ] **Step 2: Add a 409-on-draft test (RED).** In the same file, add `it("supersede rejects a non-finalized result with 409", ...)` seeding a DRAFT result and asserting `res.status === 409`. Run the file. Expected: **FAIL** (no guard yet).

- [ ] **Step 3: Add an un-mocked clone proof (RED).** In `src/lib/db/sort-pipeline.integration.test.ts`, add a `describeDb` test: create a populated draft (via `createDraftResult`), `finalizeResult` it, call `service.supersedeResult(finalizedId)`, assert the returned draft's `findByResult(newDraftId)` has the **same item count** as the source and `status === "draft"`. Run: `npm run test:db -- sort-pipeline`. Expected: **PASS or FAIL** — if the service already clones correctly, this is the un-mocked regression guard; if the finalized-only guard breaks it, fix in Step 4.

- [ ] **Step 4: Add the finalized-only guard (GREEN).** In `SortResultService.supersedeResult`, after loading the source result: if it is absent return `null`; if `result.status !== "finalized"` throw a typed error the route maps to 409 (e.g. `throw new SupersedeStateError()` or return a discriminated result — match how the route will branch; keep it simple). Otherwise clone as today.

- [ ] **Step 5: Wire + status-map the route (GREEN).** In `src/app/api/sort-results/[id]/supersede/route.ts`, construct the 3-repo `SortResultService`, call `supersedeResult(params.id)`, and map: `null` → 404, the finalized-only rejection → 409, success → 201 + the new draft. Preserve the existing `requireApiResultAccess` guard.

- [ ] **Step 6: Verify GREEN.** Run: `npx vitest run src/app/api/sort-results/[id]/supersede/route.test.ts` and `npm run test:db -- sort-pipeline`. Expected: all **PASS**.

- [ ] **Step 7: Remove the dead `ResultController.supersedeResult` stub** in `src/server/api/results.ts` (the route no longer calls it; grep to confirm).

- [ ] **Step 8: Full suite + commit.** Run: `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): supersede clones a finalized result into a new draft (409 otherwise)"
```

---

### Task 3: deleteResult — draft-only, children-first, zero-orphans

**Files:**
- Modify: `src/server/repositories/SortResultRepository.ts` (add `delete` to both interfaces)
- Modify: `src/server/repositories/implementations/SortResultRepository.ts` (`delete`) + `SortResultItemRepository.ts` (`deleteByResult`)
- Modify: `src/server/services/SortResultService.ts` (add `deleteResult`)
- Modify: `src/app/api/sort-results/[id]/route.ts` (DELETE wire + status-map)
- Modify (promote): `src/app/api/sort-results/[id]/route.test.ts:182`
- Create: un-mocked zero-orphan + 409 tests in `src/lib/db/sort-pipeline.integration.test.ts`
- Remove: `ResultController.deleteResult` stub in `src/server/api/results.ts`

**Interfaces:**
- Produces: `ISortResultRepository.delete(id: string): Promise<void>`; `ISortResultItemRepository.deleteByResult(sortResultId: string): Promise<void>`; `SortResultService.deleteResult(id: string): Promise<void>` (draft-only; throws a typed state error the route maps to 409; children-first).

- [ ] **Step 1: Write the un-mocked zero-orphan integration test (RED).** In `src/lib/db/sort-pipeline.integration.test.ts`, add a `describeDb` test: create a populated draft via `createDraftResult` (assert `findByResult(id).length > 0`); drive the real `DELETE /api/sort-results/[id]`; assert `SortResultRepository.findById(id)` is `null` AND `SortResultItemRepository.findByResult(id)` returns `[]` (zero orphaned children). Run: `npm run test:db -- sort-pipeline`. Expected: **FAIL** (DELETE is a no-op 200).

- [ ] **Step 2: Write the finalized→409 test (RED).** Add a `describeDb` test: create + `finalizeResult` a populated result; `DELETE /api/sort-results/[id]`; assert `res.status === 409` AND the result still exists (`findById` not null). Run. Expected: **FAIL**.

- [ ] **Step 3: Promote the unit DELETE tripwire (RED).** In `src/app/api/sort-results/[id]/route.test.ts:182`, change `it.fails(` → `it(`. Run: `npx vitest run src/app/api/sort-results/[id]/route.test.ts`. Expected: **FAIL**.

- [ ] **Step 4: Add the repo delete methods (GREEN).** In `src/server/repositories/SortResultRepository.ts` add `delete(id: string): Promise<void>;` to `ISortResultRepository` and `delete(id: string): Promise<void>;` + `deleteByResult(sortResultId: string): Promise<void>;` to `ISortResultItemRepository`. Implement (Drizzle, mirroring the existing `eq`-based methods):
```ts
// SortResultRepository.ts
async delete(id: string): Promise<void> {
  await this.db.delete(sortResultsTable).where(eq(sortResultsTable.id, id));
}
// SortResultItemRepository.ts
async delete(id: string): Promise<void> {
  await this.db.delete(sortResultItemsTable).where(eq(sortResultItemsTable.id, id));
}
async deleteByResult(sortResultId: string): Promise<void> {
  await this.db.delete(sortResultItemsTable).where(eq(sortResultItemsTable.sortResultId, sortResultId));
}
```

- [ ] **Step 5: Add `SortResultService.deleteResult` (GREEN).** Load the result; if absent throw/return a not-found signal (route → 404); if `status !== "draft"` throw a typed state error (route → 409); else children-first: `await this.sortResultItemRepo.deleteByResult(id); await this.sortResultRepo.delete(id);`. No transaction (per spec).

- [ ] **Step 6: Wire + status-map the DELETE route (GREEN).** In `src/app/api/sort-results/[id]/route.ts`, construct the 3-repo service, call `deleteResult(params.id)`, map the not-found→404 and the draft-only rejection→409 (replacing the current non-Unauthorized→500), success→200. Preserve `requireApiResultAccess`.

- [ ] **Step 7: Verify GREEN.** Run: `npx vitest run src/app/api/sort-results/[id]/route.test.ts` and `npm run test:db -- sort-pipeline`. Expected: all **PASS** (and the GET/PATCH tests in the unit file still pass — confirm the response shape is unchanged).

- [ ] **Step 8: Remove the dead `ResultController.deleteResult` stub** (grep to confirm no caller).

- [ ] **Step 9: Full suite + commit.** Run: `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): deleteResult removes a draft and its items, children-first (409 if finalized)"
```

---

### Task 4: deleteResultItem

**Files:**
- Modify: `src/server/services/SortResultService.ts` (add `deleteResultItem`)
- Modify: `src/app/api/sort-results/[id]/items/[rid]/route.ts` (DELETE wire)
- Modify (promote): `src/app/api/sort-results/[id]/items/[rid]/route.test.ts:204`
- Create: un-mocked item-gone assertion in `src/lib/db/sort-pipeline.integration.test.ts`
- Remove: `ResultItemController.deleteResultItem` stub in `src/server/api/result-items.ts`

**Interfaces:**
- Consumes: `ISortResultItemRepository.delete(id)` (added in Task 3).
- Produces: `SortResultService.deleteResultItem(id: string): Promise<void>`.

- [ ] **Step 1: Promote the item DELETE tripwire (RED).** In `src/app/api/sort-results/[id]/items/[rid]/route.test.ts:204`, change `it.fails(` → `it(`. Run: `npx vitest run "src/app/api/sort-results/[id]/items/[rid]/route.test.ts"`. Expected: **FAIL** (DELETE is a no-op).

- [ ] **Step 2: Write the un-mocked item-gone test (RED).** In `src/lib/db/sort-pipeline.integration.test.ts`, add a `describeDb` test: create a populated draft; pick one `SortResultItem`; drive `DELETE /api/sort-results/[id]/items/[rid]`; assert `SortResultItemRepository.findById(rid)` is `null` and the other items remain. Run: `npm run test:db -- sort-pipeline`. Expected: **FAIL**.

- [ ] **Step 3: Add `SortResultService.deleteResultItem` (GREEN).** `async deleteResultItem(id: string): Promise<void> { await this.sortResultItemRepo.delete(id); }`.

- [ ] **Step 4: Wire the route (GREEN).** In `src/app/api/sort-results/[id]/items/[rid]/route.ts` DELETE handler, construct the service and call `deleteResultItem(params.rid)`. **Preserve the existing belongs-to-parent guard** (resolve the item; 404 if `item.sortResultId !== params.id`) and `requireApiResultAccess`.

- [ ] **Step 5: Verify GREEN.** Run the unit file and `npm run test:db -- sort-pipeline`. Expected: **PASS**.

- [ ] **Step 6: Remove the dead `ResultItemController.deleteResultItem` stub** (grep to confirm no caller).

- [ ] **Step 7: Full suite + commit.** Run: `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): deleteResultItem removes a single result item"
```

---

### Task 5: listShares scoping

**Files:**
- Modify: `src/server/api/shares.ts` (`listShares`)
- Modify: `src/app/api/sort-results/[id]/shares/route.ts` (GET passes `params.id`)
- Modify (promote): `src/app/api/sort-results/[id]/shares/route.test.ts:76`

**Interfaces:**
- Consumes: `SortResultShareRepository.findByResult(sortResultId: string): Promise<SortResultShare[]>` (ALREADY EXISTS, `SortResultShareRepository.ts:49`).
- Produces: `GET /[id]/shares` returns shares scoped to `params.id` (not hardcoded `[]`).

- [ ] **Step 1: Promote the listShares tripwire (RED).** In `src/app/api/sort-results/[id]/shares/route.test.ts:76`, change `it.fails(` → `it(`. Read the test to see its assertion (a created share for the result should appear in the GET). Run: `npx vitest run "src/app/api/sort-results/[id]/shares/route.test.ts"`. Expected: **FAIL** (controller returns `[]`).

- [ ] **Step 2: Wire the controller + route (GREEN).** In `src/server/api/shares.ts`, change `listShares()` → `listShares(resultId: string)` to call `this.shareRepo.findByResult(resultId)` (inject/construct `SortResultShareRepository` as the other controller methods do). In `src/app/api/sort-results/[id]/shares/route.ts` GET, pass `params.id`. Preserve `requireApiResultAccess`.

- [ ] **Step 3: Verify GREEN + full suite + commit.** Run: `npx vitest run "src/app/api/sort-results/[id]/shares/route.test.ts"` then `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): scope listShares to the result via findByResult"
```

---

### Task 6: Release → Onward (purses-xca)

**Files:**
- Modify: `src/features/items/ItemCard.tsx:27` (`bucketLabels.low`)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/page.tsx:107` (the bucket-grid "Release" label)
- Modify (promote): `src/app/collections/[id]/results/[resultNumber]/page.test.tsx:150`

- [ ] **Step 1: Promote the page tripwire (RED).** In `src/app/collections/[id]/results/[resultNumber]/page.test.tsx:150`, change `it.fails(` → `it(`. Run: `npx vitest run "src/app/collections/[id]/results/[resultNumber]/page.test.tsx"`. Expected: **FAIL** (renders "Release").

- [ ] **Step 2: Relabel low tier (GREEN).** In `src/features/items/ItemCard.tsx`, `bucketLabels.low` from `"Release"` → `"Onward"`. In `src/app/collections/[id]/sort/[sessionNumber]/page.tsx`, change the sibling label `<p className="text-ink-soft">Release</p>` (line ~107, the low bucket count) → `Onward`. `grep -rn '"Release"\|>Release<' src` to catch any other sort/results occurrence and relabel it.

- [ ] **Step 3: Verify GREEN + full suite + commit.** Run the page test then `npm run test:ci`. Then:
```bash
git add -A && git commit -m "fix(sort): low tier reads 'Onward' not 'Release' (purses-xca)"
```

---

### Task 7: StartSessionForm → /triage

**Files:**
- Modify: `src/features/sorting/StartSessionForm.tsx:40`
- Modify (promote): `e2e/sort-session.spec.ts:115` (the `test.fixme`) + the adjacent passing detail-landing test

- [ ] **Step 1: Promote the e2e fixme and update the landing contract (RED).** In `e2e/sort-session.spec.ts`, change `test.fixme(` at line 115 → `test(`. Read the adjacent currently-passing test that asserts start lands on `/sort/{number}` (detail); **replace** its landing assertion with the triage-landing contract (start → URL ends `/sort/{number}/triage`) — this is a deliberate product change (per spec: starting a session lands directly on triage; the detail page stays reachable via breadcrumb), not a hedge. Do not keep two conflicting landing assertions.

- [ ] **Step 2: Verify the e2e fails first.** Run: `./e2e/fixtures/test-db.sh up` then `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/test npx playwright test sort-session --project=tablet`. Expected: **FAIL** (form lands on the detail page).

- [ ] **Step 3: Redirect to triage (GREEN).** In `StartSessionForm.tsx:40`, change `router.push(\`/collections/${collectionSlug}/sort/${newSession.number}\`)` → `router.push(\`/collections/${collectionSlug}/sort/${newSession.number}/triage\`)`.

- [ ] **Step 4: Verify GREEN + commit.** Re-run the e2e (Step 2 command). Expected: **PASS**. Then:
```bash
git add -A && git commit -m "fix(sort): start session lands directly on triage"
```

---

### Task 8: Repair the inert results trigger card + delete dead SessionCompleteScreen + e2e journey

**Files:**
- Create: `src/features/sessions/SeeResultsCard.tsx` (client component)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/page.tsx:141-155` (replace the inert card)
- Delete: `src/features/sessions/SessionCompleteScreen.tsx` + its test (if any)
- Modify: `e2e/sort-session.spec.ts` (add the full journey + an error-state intercept)

**Interfaces:**
- Consumes: `POST /api/sort-results` (returns the created `SortResult` with `.number`, from Task 1).
- Produces: a reachable affordance that creates a populated result and navigates to it.

- [ ] **Step 1: Confirm SessionCompleteScreen is dead, then write its removal into the task.** `grep -rn "SessionCompleteScreen" src e2e` — confirm no `import`/route mounts it (only comments/e2e references). It will be deleted in Step 5.

- [ ] **Step 2: Write the e2e happy-journey test (RED).** In `e2e/sort-session.spec.ts`, add a test (tablet project): start a session → land on triage → record a triage decision (tap a tier) → go to compare → choose one card → return to the session detail (breadcrumb) → the card now reads **"See what you love most"** with button **"Show me what I love"** → tap it → URL is `/collections/{slug}/results/{number}` → the results page shows ranked items (≥1 tier populated). Run the e2e (Task 7 Step 2 command, `sort-session`). Expected: **FAIL** (the inert card links to `/results` and creates nothing; copy differs).

- [ ] **Step 3: Write the error-state test via route-intercept (RED).** Add an e2e test that intercepts `POST /api/sort-results` to return 500, taps "Show me what I love", and asserts: a soft inline message appears ("That didn't come together just now. Nothing was lost — try again whenever you like."), the button re-enables, and the user stays on the session page (nothing lost). Expected: **FAIL** (no client trigger yet).

- [ ] **Step 4: Build the `SeeResultsCard` client component (GREEN).** Create `src/features/sessions/SeeResultsCard.tsx` (`"use client"`): props `{ collectionId: string; collectionSlug: string; bucketed: number }`. Render the Card (reuse `@/components/ui` `Card`/`Button`) with heading "See what you love most", body "Whenever you're ready, gather what you've chosen so far into one place.", button "Show me what I love". On tap: `setLoading(true)`, `fetch("/api/sort-results", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ collectionId, name: "Draft result" }) })`; on ok → read `result.number`, `router.push(\`/collections/${collectionSlug}/results/${result.number}\`)`; on failure → set the soft error message, `setLoading(false)` (button re-enabled, inputs/state preserved). Loading label "Gathering…", disabled. No confetti/streaks; semantics tap-only.

- [ ] **Step 5: Replace the inert card + delete dead code (GREEN).** In `src/app/collections/[id]/sort/[sessionNumber]/page.tsx`, replace the `{bucketed > 0 && <Card>…View Results…</Card>}` block (lines ~141-155) with `{bucketed > 0 && <SeeResultsCard collectionId={collection.id} collectionSlug={collection.slug ?? collection.id} bucketed={bucketed} />}` and import it. Delete `src/features/sessions/SessionCompleteScreen.tsx` and any `SessionCompleteScreen.test.tsx`.

- [ ] **Step 6: Verify GREEN.** Run the e2e `sort-session` suite (tablet). Expected: the journey + error-state tests **PASS**. Run `npm run test:ci` (confirm deleting SessionCompleteScreen broke no import).

- [ ] **Step 7: Commit.**
```bash
git add -A && git commit -m "fix(sort): reachable 'See what you love most' trigger creates a populated result; remove dead SessionCompleteScreen"
```

---

### Task 9: Acceptance gate

- [ ] **Step 1: Zero quarantines.** Run: `grep -rn "it\.fails\|test\.fails\|test\.fixme" src e2e --include="*.ts" --include="*.tsx"`. Expected: **no matches** (the env-gated `describeDb` skips are NOT quarantines and are fine).
- [ ] **Step 2: Unit + lint + build.** Run: `npm run test:ci && npm run lint && npm run build`. Expected: all green.
- [ ] **Step 3: DB integration.** Run: `npm run test:db`. Expected: all green (serial).
- [ ] **Step 4: E2E (the app works).** Run: `./e2e/fixtures/test-db.sh up` then the full Playwright suite. Expected: green; the journey demonstrates start → triage AND compare → trigger → populated results.
- [ ] **Step 5: `npm run auth:verify`.** Expected: green.

## Self-Review

- **Spec coverage:** all 8 tripwires mapped to Tasks 1–8; acceptance gate = Task 9. supersede finalized-guard (Task 2), deleteResult children-first/409/zero-orphan (Task 3), route 404/409 mapping (Tasks 2, 3), both-decision rank-order (Task 1), un-mocked proof per fix (Tasks 1–4 integration + 7–8 e2e), UI trigger + dead-code deletion (Task 8). ✓
- **Type consistency:** `delete(id)`/`deleteByResult(sortResultId)` declared in interfaces (Task 3) before use (Task 4); `createDraftResult(collectionId, curatorId, name)`/`supersedeResult(id)` match the live signatures; `computedRank` 0-based (0=best) used consistently. ✓
- **Placeholder scan:** every step names exact files, the exact tripwire line to promote, the exact assertion, and the run command. ✓
