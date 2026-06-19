# Sort-flow repair — design (canonical TDD, rev-2)

**Date:** 2026-06-19 (rev-2 — folds the adversarial spec-review BLOCK + the owner's acceptance criteria)
**Scope:** Repair the **sessions → sort → results** workflow so it actually works end-to-end, proven in Playwright. Production-code fixes, canonical TDD. Branch `fix/sort-flow-repair`.

## Acceptance criteria (the contract)

1. **0 `it.fails` / `test.fails` / `test.fixme`** anywhere in the sort domain — every diagnostic tripwire is **fixed and promoted to a passing real test**.
2. **Avoid mocking** — the authoritative proof of each fix is **un-mocked**: DB-backed integration (real Postgres, real repos) and Playwright e2e (real UI). Mock only true boundaries (auth session, the `fetch`/network edge, Blob) and only where a real test genuinely can't reach.
3. **All tests pass** — `test:ci`, the `db-tests` tier, and the `e2e` tier all green, with no quarantines.
4. **The application works, demonstrated in Playwright e2e** — a real journey: start a session → make **triage and compare** decisions → tap the results trigger → land on a **populated** results page.

## Why

Diagnosed in PR #207 (`docs/diagnosis/2026-06-19-sort-flow-findings.md`, bd memory `sort-flow-break-diagnosis`): `POST /api/sort-results` writes an empty draft; `SortResultService.createDraftResult` (the complete populating path) is orphaned; sibling lifecycle methods are stubs/throws; the only result-creation caller (`SessionCompleteScreen`) is dead; plus `listShares` returns unscoped `[]`, `ItemCard` low tier reads "Release", and `StartSessionForm` doesn't reach triage. This repair fixes all of it and turns every tripwire green.

## Scope

**In scope — every tripwire's break:** result creation (POST→materialize + the live integration seam); `supersede` (clone, finalized-only); `deleteResult`; `deleteResultItem`; `listShares` result-scoping; `Release→Onward` (`purses-xca`); `StartSessionForm`→`/triage` (the e2e `fixme`); the reachable results trigger + deleting dead `SessionCompleteScreen`.
**Out of scope:** the results-*presentation* gentle redesign (`purses-o93`) — it is a design bead, **not** a tripwire; the page already renders.
**Not modified (already sound):** triage + pairwise decision-recording and the decision→preference seam (proven). The repair makes their combined output reachable and **verifies both decision types reach a populated result**.

## Resolved design decisions (folding the review)

**Canonical owner — scoped honestly (Architect findings 3, 4).** `SortResultService` becomes the owner of the **broken lifecycle mutations**: `createDraftResult`, `supersedeResult`, `deleteResult`. The **working** `getResult` / `updateResult` / `finalizeResult` stay on `ResultController`, and the item-level `listResultItems` / `updateResultItem` / `resetResultItem` stay on `ResultItemController` — migrating them would change response shapes/validation for **zero repair value** and is explicitly *not* done here. We delete only the **stub** methods (`ResultController.createDraftResult`/`supersedeResult`/`deleteResult`, `ResultItemController.deleteResultItem`). The spec makes no "single owner of everything" claim — it consolidates the *broken mutations* on the service, nothing more.

**supersede keeps the finalized-only invariant (Architect finding 1).** Today's `ResultController.supersedeResult` guards `status === "finalized"`; `SortResultService.supersedeResult` has **no guard**. The repair **adds** the guard to the service: supersede a non-finalized result → **409** (superseding a draft is meaningless and litters duplicate drafts). The route maps service `null` (absent) → 404.

**`deleteResult` — explicit transactional child-delete, hard delete, draft-only (Architect 2; Data 1, 2, 4).** The `sort_result_items → sort_results` FK is `ON DELETE no action` (`schema.ts`, `drizzle/0000…:292`) — **no DB cascade** — so a bare result delete FK-violates (`23503`) on any populated draft. Therefore `deleteResult` **explicitly deletes the child `SortResultItem` rows first, then the result, in one transaction**. **Hard delete, justified:** a draft `SortResult` is *derived, re-creatable* state (regenerated from `CollectionPreferenceItem` rows), not archived user content with blobs — so it is exempt from the `softDelete`/`deletedAt` precedent and the infra §11.4 `purge` (owner-only/confirm) model, which govern user content. **Draft-only:** finalized results are immutable (infra §11.3) → **409**.

**Repo additions.** `ISortResultRepository.delete(id)`; `ISortResultItemRepository.delete(id)` **and `deleteByResult(resultId)`** (for the transactional cascade); + implementations. **No schema migration** (DELETE queries only; we deliberately do *not* add `ON DELETE CASCADE`).

**UI trigger (UX decision).** Repair the inert `bucketed > 0` "Ready to see results?" card on the session-detail page (it currently links to `/results` and creates nothing): on tap → `POST /api/sort-results` (now populating via the service) → `router.push` to `/collections/{slug}/results/{number}`. Person's-side copy — heading **"See what you love most"**, body **"Whenever you're ready, gather what you've chosen so far into one place."**, button **"Show me what I love"**. States: loading → "Gathering…" (disabled, no overlay); empty → card hidden; error → inline, soft, reversible ("That didn't come together just now. Nothing was lost — try again whenever you like.") + re-enable; success → quiet `router.push`. **Delete `SessionCompleteScreen` + test.** Reject auto-generate (violates TONE one-decision/unpressured).

**Peripheral fixes (to reach 0 `it.fails`).**
- `listShares`: add `SortResultShareRepository.findByResult(resultId)`; the `shares` GET passes `params.id` so the list is scoped to the result (not hardcoded `[]`).
- `Release→Onward`: `ItemCard` low-tier label `"Release"` → `"Onward"` (and any sibling "Release" label in the sort/results UI), satisfying `purses-xca`.
- `StartSessionForm`→`/triage`: the start flow lands the curator on `/sort/{number}/triage` so the e2e `fixme` promotes (confirm against the intended flow; the adjacent passing test pins the prior detail-landing — replace it with the triage-landing contract).

## Wiring (route → owner)

| Route | Today | Target |
|---|---|---|
| `POST /api/sort-results` | raw repo create (empty) | **`SortResultService.createDraftResult`** (populates from preferences) |
| `POST /[id]/supersede` | `ResultController.supersedeResult` (throws) | **`SortResultService.supersedeResult`** (finalized-only → else 409; absent → 404; else 201 + cloned items) |
| `DELETE /[id]` | `ResultController.deleteResult` (no-op) | **`SortResultService.deleteResult`** (draft-only → else 409; txn: delete child items then result) |
| `DELETE /[id]/items/[rid]` | `ResultItemController.deleteResultItem` (no-op) | **`SortResultService.deleteResultItem`** (repo delete) |
| `GET /[id]` · `PATCH /[id]` · `finalize` | `ResultController` (WORK) | **unchanged** — retained deliberately |
| `GET /[id]/shares` | `ShareController.listShares()` (`[]`) | `ShareController.listShares(resultId)` → `findByResult` |

Routes construct the service with `getDb()`-backed repos behind the existing `requireApiCollectionAccess`/`requireApiResultAccess` guards (unchanged authz), exactly as `decisions`/`preferences` routes construct their services.

## TDD method — canonical, no shortcuts, un-mocked proof

Each behavior is one **Red → Green → Refactor** cycle; **a fresh failing test is written first for every genuinely-new behavior** (not just tripwire promotion):
1. **Red:** write the smallest failing test for the behavior, **run it, capture the failure**. It must fail for the intended reason before any production code. The matching tripwire is promoted (`it.fails`→`it`) as part of this and must go genuinely red first.
2. **Green:** minimal production code.
3. **Refactor**; full suite green; commit.

**Un-mocked proof is mandatory per fix (acceptance #2):** the coarse mock-deep tripwires (`toHaveBeenCalled` on POST; status-only on supersede; store-mock on deletes) are **not sufficient on their own** — each fix's authoritative test is un-mocked:
- **POST materialize** → the un-mocked `db-tests` seam (`sort-results-authz.integration.test.ts:306`: live POST → `findByResult(newId)` non-empty) + the e2e journey.
- **deleteResult** → a `db-tests` test asserting the result is gone **and `findByResult(id)` returns `[]` (zero orphaned child rows)** (Data finding 5), plus a real test for finalized→409.
- **supersede** → a test asserting finalized→409 and that a finalized result produces a new draft with **cloned items** (real rows, not a status-only check).
- **both decision types** → a `db-tests` test recording a **triage** and a **pairwise** decision, then asserting **pairwise rank-order within a shared tier**: two items triaged to the *same* tier, one wins the pairwise → its `computedRank` is above the loser's (the only fact attributable to pairwise, since same-tier triage alone leaves them tied) (QA finding B).
- **UI trigger** → the e2e journey (happy path) + an error-state check via a Playwright **route-intercept** forcing the POST to fail (real UI, no unit mock), asserting the soft message + re-enable + nothing lost.

The implementer report must show **red-then-green** per behavior; no test+code written together.

## Sequence (TDD order)

1. Repo `delete(id)` + `deleteByResult(resultId)` (item repo) + `delete(id)` (result repo) — test-first.
2. `SortResultService.deleteResult` (draft-only 409 + txn child-then-parent) + `deleteResultItem` — test-first (unit) + the `db-tests` zero-orphan assertion.
3. Wire `POST → createDraftResult` → promote POST-materialize tripwire + the integration seam tripwire green.
4. Add the finalized-only guard to `supersedeResult`; wire `[id]/supersede` → promote supersede tripwire (incl. 409 + clone).
5. Wire `[id] DELETE` → `deleteResult`; `items/[rid] DELETE` → `deleteResultItem` → promote both delete tripwires.
6. Delete `ResultController`/`ResultItemController` stub methods; run `test:ci` + `db-tests` (no orphan imports).
7. `listShares` scoping (repo `findByResult` + pass `params.id`) → promote listShares tripwire.
8. `Release→Onward` label → promote the page tripwire (`purses-xca`).
9. `StartSessionForm`→`/triage` → promote the e2e `fixme`.
10. UI trigger: repair the session-detail card (create→navigate, copy, states) + delete `SessionCompleteScreen`; add the e2e journey + the route-intercept error test.
11. **Acceptance gate:** `grep -r "it.fails\|test.fails\|test.fixme" src e2e` → **none** in the sort domain; full suite + `db-tests` + Playwright all green; the e2e demonstrates the working app.

## Testing tiers (all run in CI; minimize mocks)

- **Unit:** service `deleteResult`/`deleteResultItem`/`supersedeResult` guards (draft-only 409, finalized-only 409); repo delete signatures. Mock only repos where a unit test adds value over the integration proof.
- **Integration (`RUN_DB_TESTS`, un-mocked):** live POST → populated result with **triage + pairwise rank-order**; deleteResult → result gone + **zero orphaned items**; supersede finalized→new draft with cloned items; listShares scoped to the result.
- **E2E (Playwright, real UI):** the journey (start → triage + compare → "Show me what I love" → populated results page); the trigger error state via route-intercept; results show "Onward" (not "Release"); start lands on triage.

## Error handling

Route authz guards unchanged. `deleteResult`/`supersede` 409 on wrong status. POST forces `curatorId` from session, 400 on missing fields. The delete transaction rolls back on failure (no partial child-delete). UI trigger error is gentle/reversible, state preserved.

## Advances

Repairs `purses-r7p` (result-creation), satisfies `purses-xca` (Release→Onward), and removes all sort-domain quarantines. Leaves `purses-o93` (results presentation) as the tracked follow-up.
