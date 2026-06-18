# Security cluster: close authz holes in sort-results / sessions / preferences APIs

**Beads:** purses-axn (P1), purses-51h (P1), purses-33u (P2) — under epic purses-pv9.
**Date:** 2026-06-17
**Type:** Security fix (cross-tenant write / IDOR + within-collection read leak).

## Problem

Three live API families authenticate the caller but never check that the caller may
touch the *collection* (or the *curator-owned resource*) they name. All holes are
reachable by direct API call regardless of UI wiring.

1. **Whole `/api/sort-results/**` subtree is `requireAuth()`-only** (11 route files, ~18
   handlers). `purses-axn` named 3; the rest share the identical hole:
   - `POST /api/sort-results` — inserts with attacker-supplied `body.collectionId`, no
     access check. *Also* bypasses `SortResultRepository.create`, so it never allocates
     `number` (inserts `number: null`) — the same line is the `purses-r7p` creation bug.
   - `GET/PATCH/DELETE /api/sort-results/[id]`, `.../finalize`, `.../supersede`,
     `.../items`, `.../items/[rid]` (+ `/reset`), `.../shares`, `.../shares/[sid]` — act
     on `params.id`/`rid` with no collection-access and no ownership check. IDOR: any
     authed user can read/modify/finalize/delete/share **any** result in **any** tenant.
   - `DELETE .../items/[rid]` ignores `rid` entirely (`controller.deleteResultItem()`
     takes no args) — dead/incorrect; will be guarded and corrected.
2. **Session-LIST GETs leak across curators** (`purses-33u` #1): `GET /api/sessions?collectionId`
   and `GET /api/collections/[id]/sessions` pass collection-access but return **all
   curators'** sessions. The user-facing pages are already curator-scoped (t9l,
   `findByCollectionAndCurator`); only these JSON APIs leak. Within-collection read leak.
3. **Preferences routes lack a membership gate** (`purses-51h`): `GET /api/preferences/[collectionId]`
   and `GET+DELETE /api/collections/[id]/preferences` are `requireAuth()`-only. Self-scoped
   to `user.id`, but no `requireApiCollectionAccess`. The `DELETE` (clears preferences) is
   the sharpest — a missing tenant gate on a write.
4. **Dead `DecisionController.createDecision` has no curator guard** (`purses-33u` #2).
   `src/server/api/decisions.ts` is defined but never instantiated; the live decisions
   route does its own guarded insert.

## Approach

Reuse the two existing guard tiers — **no new DAL, no role-model change** (those are the
later epic PRs purses-89g/crt/g6o). The tiers, already proven in
`sessions/[id]/route.ts`:

- **Tier 1 — tenant gate:** `requireApiCollectionAccess(db, collectionId, userId)` →
  `Collection | NextResponse` (404 absent, 403 non-member).
- **Tier 2 — ownership gate:** `if (entity.curatorId !== userId) return 403` for
  resources a single curator owns (the t9l pattern).

### A. sort-results subtree (purses-axn, expanded to the whole subtree per decision)

Add a sibling helper in `src/server/dal/collection-access.ts`, mirroring the inline
`authorizeSession` in `sessions/[id]/route.ts`:

```ts
// Resolve a sort-result, then gate by collection access AND curator ownership.
// Returns the result when the caller may act on it, else a NextResponse to return.
export async function requireApiResultAccess(
  db: Database, resultId: string, userId: string,
): Promise<SortResult | NextResponse> {
  const result = await new SortResultRepository(db).findById(resultId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, result.collectionId, userId);
  if (access instanceof NextResponse) return access;
  if (result.curatorId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
```

Apply to **every** `[id]` handler (GET/PATCH/DELETE on `route.ts`, `finalize`,
`supersede`, `items` list, `items/[rid]` GET/PATCH/DELETE, `items/[rid]/reset`, `shares`
GET/POST, `shares/[sid]` GET/PATCH/DELETE). Each route: `getSession` → 401 → resolve via
`requireApiResultAccess(db, params.id, userId)` → return on `NextResponse`.

- **`items/[rid]`**: after `requireApiResultAccess(params.id)`, verify the result-item
  belongs to `params.id` (belongs-to-parent integrity, mirroring #196's "compare against
  the resolved id"). Fix `DELETE` to act on the verified `rid`.
- **`POST /api/sort-results`**: `requireApiCollectionAccess(body.collectionId, userId)`,
  then create through `SortResultRepository.create` (allocates `number`) with
  `curatorId = userId`. Closes the IDOR *and* the `number: null` bug. (UI wiring of the
  creation trigger — `purses-r7p` — stays a separate decision; this only makes the
  endpoint correct and safe.)

### B. session-list GETs (purses-33u #1 + part of 51h)

Curator-scope both list GETs: swap `findByCollection` → `findByCollectionAndCurator(collectionId, userId)`
(already exists). `GET /api/sessions` keeps `requireApiCollectionAccess` then returns the
caller's own sessions only; `GET /api/collections/[id]/sessions` likewise. POST
`/api/sessions` (live, StartSessionForm) is unchanged — already guarded.

### C. preferences routes (purses-51h)

Add `requireApiCollectionAccess(collectionId, userId)` to `GET /api/preferences/[collectionId]`
and `GET+DELETE /api/collections/[id]/preferences`. Behavior already self-scopes to
`user.id`; this adds the missing membership gate.

### D. dead code (purses-33u #2)

Delete `DecisionController` (`src/server/api/decisions.ts`) and any now-unused exports,
after confirming nothing imports `CreateDecisionInput`/the class. Deletion over guarding
dead code.

### Deliberate scope boundaries (ponytail)

- **No structural "consolidation"** of flat-vs-nested route trees (51h mentions it). Both
  session-LIST GETs and both preferences routes currently have **no client callers**
  (server components read via repositories directly). Merging/removing them is a refactor
  that belongs to the DAL-migration PR (purses-g6o). This PR **guards** them and files a
  follow-up bead to remove the unused duplicates. Security first, structure later.
- **No deletion of dead-but-reachable sort-result sub-routes** (shares/supersede/items).
  Guarding closes the hole; deletion is cleanup for another pass.

## Testing (required — every fix proven un-mocked against ephemeral Postgres)

Models: `src/lib/db/file-route-authz.integration.test.ts`,
`triage-decision.integration.test.ts`. Mock **only** `@/lib/auth` (flat-replace
`vi.mock("@/lib/auth", () => ({ getSession }))`) and `@/lib/db`; everything else hits the
real DB through real repositories/controllers. Behind `RUN_DB_TESTS=1`, in the CI
`db-tests` job.

1. `sort-results-authz.integration.test.ts` — for representative handlers across the
   subtree (GET/PATCH/finalize/DELETE on `[id]`, POST create, `items/[rid]`,
   `shares`):
   - curator on own result → 200/201;
   - **non-member** on another tenant's result → **403** (IDOR regression);
   - **member-but-not-curator** → **403** (curator-scope regression);
   - absent result id → 404;
   - `POST` → 403 for a collection the caller isn't in; **success allocates a non-null
     `number`** (regression for the `number: null` bug / r7p coupling);
   - `items/[rid]` with an `rid` from a *different* result → 404 (belongs-to-parent).
2. `session-list-authz.integration.test.ts` (33u) — seed two curators' sessions in one
   collection; each list GET (flat + nested) returns **only the caller's own** (read-leak
   regression); non-member → 403.
3. `preferences-authz.integration.test.ts` (51h) — non-member → 403 on GET and on DELETE;
   member → 200; DELETE clears only the caller's own prefs.

Existing handler/page unit tests must stay green (curator-scope matches the page
precedent, so no behavioral break expected).

## Out of scope / follow-ups (file as beads)

- Remove unused flat-vs-nested duplicate list/preference routes (after DAL migration g6o).
- Delete or repurpose dead-but-reachable sort-result sub-routes if confirmed unused.
- `purses-r7p` UI wiring of the results-creation trigger (couples to POST, decided separately).
- ESLint import-boundary + route-enumeration CI test (`purses-o03`) — the durable guard
  against regressions like these.
```
