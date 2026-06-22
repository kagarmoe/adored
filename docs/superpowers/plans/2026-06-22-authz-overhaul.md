# Authorization Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each PR is a separate branch off `origin/main`; merge before starting the next.

**Goal:** Collapse the barely-enforced 10-flag collection-permission model to an Owner/Curator role model behind one DAL capability chokepoint, close the live IDOR holes, and fix the validation/state/deletion correctness bugs.

**Architecture:** `collection.ownerId` is the sole owner source; any member is a curator; `membership.role` is a display label, never enforced. A compile-exhaustive `CAPABILITIES: Record<Operation, Role>` map + `requireApiCapability(db, collectionId, userId, op)` is the single API authz chokepoint; resource wrappers resolve item/invitation → collectionId then delegate. Expand-only migration (flags become inert; columns/types stay this epic).

**Tech Stack:** Next.js App Router (route handlers), Drizzle ORM + Postgres (Neon), NextAuth v4 (JWT), Zod, Vitest (unit `test:ci` + DB-integration `RUN_DB_TESTS`), Vercel Blob.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-22-authz-overhaul-design.md` is authoritative. Read §3 (model), §3.4 (403/404 posture), §5 (fixes), §6 (tests) before any task.
- **Owner = `collection.ownerId` only.** `membership.role` is never read for an authz decision. No role-write path in the member API; every added/invited member is a curator.
- **403-vs-404:** 404 absent, 403 exists-but-forbidden (resolve-then-authorize). Never leak body validity to an unauthorized caller (authz before body parse).
- **`ownerId`/`curatorId` come from the session, never the body.**
- **Tests:** integration-over-mocked for every authz path — mock only `getSession` (+ `@vercel/blob` when blobs are touched); real DAL/repos/Postgres. DB suites gated `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip`. Assert **state** on negative paths, not just status. DB tests run serially. YAGNI does NOT apply to tests (per user global): every branch/error path/invariant gets a real test that runs in CI.
- **Coverage:** keep the merged floor (`ci.yml` "Merged coverage floor", `--coverage.thresholds.lines=82`) ≥82, all tiers green.
- **Run DB tests CI-style:** `RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh` (Docker, serial). Single file fast loop: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/<file>` after `bash e2e/fixtures/test-db.sh up`.
- **Gates (pre-push mirrors):** `npm run build`, `npm run test:ci`, `npm run lint`, `npm run auth:verify`, `npm run test:db`.
- **Per PR:** flip pins first (RED), product code (GREEN), delete pin comment; whole-branch `adversarial-review`; `verification-before-completion`; `/sync-docs` (update `docs/API.md`; never PRODUCT/TONE) + `/graphify --update` before push; rebase onto `origin/main` if behind; merge when CI green; `/close-out`.
- **Mock boilerplate** (reuse verbatim): `e2e/fixtures/mock-auth.ts` `mockAuth(getSession)`; `vi.mock("@/lib/auth", () => mockAuth(mockGetSession))`; `vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }))`. Seed via `e2e/fixtures/seed.ts` (`seedBaseline`, `seedFullCollection` — owner + a curator member with `canManageCollection=false`), reset via `resetDb()`/`closeDb()` from `e2e/fixtures/db.ts`.

---

# PR1 — IDOR hotfix (purses-3al, purses-55c, purses-nj7-scope) — branch `feat/authz-overhaul-pv9` (carries the spec+plan docs)

**Deliverable:** every `requireAuth`-only collection-scoped route is scoped to its collection via the existing `requireApiCollectionAccess` (member-or-owner). No capability map yet. Pure tightening.

**Pattern for a resource-by-id route (items/[id], invitations/[id]):**
```ts
const user = await requireAuth();                       // existing 401 path stays
const db = getDb();
const row = await new XRepository(db).findByIdIncludingDeleted(params.id); // lifecycle: incl. soft-deleted
if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
const access = await requireApiCollectionAccess(db, row.collectionId, user.id);
if (access instanceof NextResponse) return access;       // 404 absent / 403 forbidden
// ... existing handler body, operating on the resolved row ...
```

### Task 1.1: items/[id] GET·PATCH·DELETE IDOR (purses-3al)

**Files:**
- Modify: `src/app/api/items/[id]/route.ts`
- Test (flip): `src/lib/db/collection-items-routes.integration.test.ts` (IDOR pins ~L222/272/319), `src/lib/db/lifecycle-routes.integration.test.ts` (restore absent 500→404 not here)

**Interfaces:** Consumes `requireApiCollectionAccess(db, collectionId, userId): Promise<Collection | NextResponse>` (`@/server/dal/collection-access`), `ItemRepository.findById`/`findByIdIncludingDeleted`. GET uses `findById` (404 if soft-deleted is correct for read); PATCH/DELETE resolve then gate.

- [ ] **Step 1 — flip the pins to intended (RED).** In `collection-items-routes.integration.test.ts`, change the three "stranger can read/patch/delete" pins from `200`+mutation to `403`+unchanged-state; delete the `// pins current behavior … pv9` comments. Run: `RUN_DB_TESTS=1 … npx vitest run --no-file-parallelism src/lib/db/collection-items-routes.integration.test.ts` → expect FAIL (currently 200).
- [ ] **Step 2 — implement.** In `items/[id]/route.ts` GET/PATCH/DELETE: after `requireAuth()`, resolve the item (GET: `findById`; PATCH/DELETE: `findById` — these are not lifecycle-restore, soft-deleted items 404 on read/edit/delete), `requireApiCollectionAccess(db, item.collectionId, user.id)`, early-return on `NextResponse`. Keep existing try/catch + error mapping.
- [ ] **Step 3 — run** the file → expect PASS (403 + state unchanged).
- [ ] **Step 4 — commit** `fix(authz): scope /api/items/[id] to collection access (IDOR, purses-3al)`.

### Task 1.2: items POST + restore IDOR (purses-3al)

**Files:** Modify `src/app/api/items/route.ts` (POST `?collectionId=`), `src/app/api/items/[id]/restore/route.ts`. Flip `lifecycle-routes.integration.test.ts` (restore stranger 200→403; restore absent 500→404), `core-routes.integration.test.ts` (items-POST stranger 201→403).

- [ ] **Step 1 — flip pins (RED):** restore-stranger→403+still-soft-deleted; restore-absent→404; items-POST-stranger→403+no row.
- [ ] **Step 2 — implement.** POST: `requireApiCollectionAccess(db, collectionId, user.id)` on the query-param `collectionId` before `createItem`. restore: resolve via `findByIdIncludingDeleted` (404 absent), then `requireApiCollectionAccess(item.collectionId)`, then restore.
- [ ] **Step 3 — run** both files → PASS.
- [ ] **Step 4 — commit** `fix(authz): scope /api/items POST + restore to collection (IDOR, purses-3al)`.

### Task 1.3: collections/[id] GET + members GET (purses-55c)

**Files:** Modify `src/app/api/collections/[id]/route.ts` GET, `src/app/api/collections/[id]/members/route.ts` GET. Flip `core-routes.integration.test.ts` (GET collection absent 500→404; add stranger→403) + `lifecycle-routes.integration.test.ts` (members stranger 200→403).

- [ ] **Step 1 — flip pins (RED):** GET-collection stranger→403, absent→404; GET-members stranger→403.
- [ ] **Step 2 — implement.** Both GETs: `getSession`→401, `requireApiCollectionAccess(db, params.id, user.id)`, early-return; then existing controller call. (This also turns the controller-throws-500 into the guard's 404.)
- [ ] **Step 3 — run** → PASS.
- [ ] **Step 4 — commit** `fix(authz): require collection access on GET collection + members (IDOR, purses-55c)`.

### Task 1.4: invitations/[id] + resend scope (purses-nj7) + ride-along 404s

**Files:** Modify `src/app/api/invitations/[id]/route.ts` (GET·PATCH·DELETE), `src/app/api/invitations/[id]/resend/route.ts`, `src/app/api/collections/[id]/archive/route.ts` + `restore/route.ts` (absent 403→404). Flip `invitations-routes.integration.test.ts` (nj7 four 200→403; absent 500→404) + `lifecycle-routes.integration.test.ts` (archive/restore absent 403→404).

- [ ] **Step 1 — flip pins (RED).**
- [ ] **Step 2 — implement.** invitations/[id]: resolve invitation via `InvitationRepository.findById` (404 absent), `requireApiCollectionAccess(db, invitation.collectionId, user.id)` (member-or-owner; owner-only tightening is PR4), early-return; then existing op. archive/restore: when the collection is absent, return 404 (the `canManageCollection`/owner check currently 403s on absent — resolve collection first, 404 if null).
- [ ] **Step 3 — run** → PASS.
- [ ] **Step 4 — commit** `fix(authz): scope invitations/[id]+resend to collection; 404 on absent (purses-nj7)`.

### Task 1.5: preferences gate (purses-55c family)

**Files:** Modify `src/app/api/collections/[id]/preferences/items/route.ts` + `recalculate/route.ts`. Add/flip stranger pins in `preferences-authz` or `core-routes` integration (stranger→403).

- [ ] **Step 1 — test (RED):** stranger (non-member) → 403 on both (still caller-scoped for members).
- [ ] **Step 2 — implement:** add `requireApiCollectionAccess(db, params.id, user.id)` before the caller-scoped controller call.
- [ ] **Step 3 — run** → PASS.
- [ ] **Step 4 — commit** `fix(authz): gate preferences routes on collection access (purses-55c)`.

### Task 1.6: PR1 close-out

- [ ] Run all gates: `npm run build && npm run test:ci && npm run lint && npm run auth:verify` and `RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh`.
- [ ] `/sync-docs` — update `docs/API.md` (remove the `⚠` from items/[id]*, collections/[id] GET, members GET, invitations/[id]*; move to guarded; update Known authz gaps). `/graphify --update`.
- [ ] whole-branch `adversarial-review` (security + architect). Fold findings.
- [ ] Push, open PR, CI green (rebase if behind), merge, `/close-out` (close purses-3al, purses-55c; purses-nj7 partial — keep open for owner-tightening in PR4).

---

# PR2 — Error-handling sweep (purses-7jds, purses-ydph, purses-zeyd, purses-4wj2 GAP B) — new branch off main

**Deliverable:** one `errorResponse(error)` helper applied across all routes; finalize state guard; signup timing equalizer. Role-independent.

### Task 2.1: errorResponse helper

**Files:** Create `src/server/api/http-errors.ts`; Test `src/server/api/http-errors.test.ts` (unit).

**Interfaces — Produces:**
```ts
// src/server/api/http-errors.ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth"; // verify export name
import { DeleteResultStateError, SupersedeStateError, FinalizeStateError } from "@/server/services/SortResultService";
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
  if (error instanceof DeleteResultStateError || error instanceof SupersedeStateError || error instanceof FinalizeStateError)
    return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof UnauthorizedError || (error instanceof Error && error.message === "Unauthorized"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
}
```
- [ ] **Step 1 — failing unit test** covering each branch (SyntaxError→400, ZodError→400 with details, each state error→409, Unauthorized→401, generic→500). Run → FAIL.
- [ ] **Step 2 — implement** the helper (FinalizeStateError defined in Task 2.3 — create a temporary local class first, or do 2.3 before 2.1's import; sequence 2.3 then 2.1).
- [ ] **Step 3 — run** → PASS. **Step 4 — commit.**

### Task 2.2: 7jds + 4wj2-B (items POST + invitation-create validation → 400)

**Files:** Modify `src/app/api/collections/[id]/items/route.ts` POST, `src/app/api/collections/[id]/invitations/route.ts` POST, `src/app/api/items/route.ts` POST. Flip `collection-items-routes` (7jds 500→400), `collection-invitations-routes` (missing/malformed email 500→400), `core-routes` (items 500→400).

- [ ] **Step 1 — flip pins (RED):** invalid body → 400, 0 rows.
- [ ] **Step 2 — implement:** wrap the controller call in try/catch returning `errorResponse(error)` (covers ZodError→400). Keep the existing `request.json()` SyntaxError handling (or route it through errorResponse too).
- [ ] **Step 3 — run** → PASS. **Step 4 — commit** `fix(api): map ZodError→400 on item/invitation create (purses-7jds, purses-4wj2)`.

### Task 2.3: ydph — finalize 409 state guard + sort-result/share ZodError→400

**Files:** Modify `src/server/services/SortResultService.ts` (add `FinalizeStateError`), `src/server/api/results.ts` (`finalizeResult` guard), `src/app/api/sort-results/[id]/finalize/route.ts`, `src/app/api/sort-results/[id]/items/[rid]/route.ts` PATCH, `src/app/api/sort-results/[id]/shares/route.ts` POST, `src/app/api/sort-results/[id]/shares/[sid]/route.ts` PATCH. Flip `sort-results-pipeline.integration.test.ts` (re-finalize 200→409; bad enum 500→400).

**Interfaces — Produces:** `class FinalizeStateError extends Error` (name `"FinalizeStateError"`, message `"Can only finalize draft results"`).

- [ ] **Step 1 — flip pins (RED):** re-finalize → 409; bad manualBucket enum → 400.
- [ ] **Step 2 — implement:** `ResultController.finalizeResult` — `if (result.status === "finalized") throw new FinalizeStateError()`. finalize route + the three PATCH/POST routes: catch → `errorResponse(error)`.
- [ ] **Step 3 — run** → PASS. **Step 4 — commit** `fix(sort-results): finalize 409 state-guard + ZodError→400 (purses-ydph)`.

### Task 2.4: zeyd — signup timing equalizer

**Files:** Modify `src/app/api/auth/signup/route.ts`. Flip/refine `core-routes.integration.test.ts` signup pin (note constant-work; the dup path now also hashes).

- [ ] **Step 1 — test:** keep the dup-email→201 + single-row assertion; add a comment that the dup branch now performs an equivalent hash (timing equalized). (A timing assertion is flaky; assert the code path via the 201 + a unit check that bcrypt.hash is invoked on the dup branch is acceptable, or just document.)
- [ ] **Step 2 — implement:** in the `existing.length > 0` branch, `await bcrypt.hash(password, 12)` before the early `201` return.
- [ ] **Step 3 — run** → PASS. **Step 4 — commit** `fix(security): equalize signup dup-email timing (purses-zeyd)`.

### Task 2.5: PR2 close-out — gates, `/sync-docs` (API.md status-code notes), adversarial-review, PR, merge, `/close-out` (close 7jds, ydph, zeyd; 4wj2 partial).

---

# PR3 — Role model core (purses-crt + purses-89g) — new branch off main

**Deliverable:** the DAL capability chokepoint, role write-paths, transactional owner bootstrap, no-client-flags, accept fix, additive `0006` migration. No route migrations yet (PR4), but the three existing guards are re-expressed on the core.

### Task 3.1: capability map + resolveEffectiveRole (unit)

**Files:** Create `src/server/dal/capabilities.ts`; Test `src/server/dal/capabilities.test.ts`.

**Interfaces — Produces:**
```ts
export type Role = "owner" | "curator";
export type Operation =
  | "collection:read" | "collection:manage" | "collection:purge" | "collection:audit"
  | "members:read" | "members:manage"
  | "invitations:read" | "invitations:manage"
  | "items:read" | "items:write" | "items:purge"
  | "photos:write" | "sessions:write" | "preferences:write";
export const CAPABILITIES: Record<Operation, Role> = {
  "collection:read":"curator","members:read":"curator","items:read":"curator",
  "items:write":"curator","photos:write":"curator","sessions:write":"curator","preferences:write":"curator",
  "invitations:read":"owner","collection:manage":"owner","collection:purge":"owner","collection:audit":"owner",
  "members:manage":"owner","invitations:manage":"owner","items:purge":"owner",
};
export function roleSatisfies(effective: Role, required: Role): boolean {
  return effective === "owner" || effective === required; // owner satisfies all; curator satisfies curator
}
export function resolveEffectiveRole(
  collection: { ownerId: string }, membership: { id: string } | null, userId: string
): Role | null {
  if (collection.ownerId === userId) return "owner";
  if (membership) return "curator";
  return null;
}
```
- [ ] **Step 1 — failing unit tests:** owner via ownerId (no membership row → still owner); curator via membership; null for non-member; `roleSatisfies(owner, owner/curator)=true`, `(curator, curator)=true`, `(curator, owner)=false`; every Operation has a CAPABILITIES entry (the `Record` makes this compile-checked — assert the map's keys length too).
- [ ] **Step 2 — implement** as above. **Step 3 — run** → PASS. **Step 4 — commit.**

### Task 3.2: requireApiCapability + resource wrappers; re-express existing guards (DB-seam)

**Files:** Modify `src/server/dal/collection-access.ts` (add `requireApiCapability`, `requireApiItemCapability`, `requireApiInvitationCapability`; re-express `requireApiCollectionAccess`/`requireApiCollectionOwner`/`requireApiResultAccess` on the core). Test: `src/lib/db/collection-access.integration.test.ts` (new — 55c.2; un-mocked).

**Interfaces — Produces:**
```ts
export async function requireApiCapability(db, collectionId: string, userId: string, op: Operation): Promise<Collection | NextResponse>;
export async function requireApiItemCapability(db, itemId: string, userId: string, op: Operation): Promise<Item | NextResponse>;       // resolves incl. soft-deleted for items:purge/lifecycle; 404 absent
export async function requireApiInvitationCapability(db, invitationId: string, userId: string, op: Operation): Promise<Invitation | NextResponse>;
```
`requireApiCapability`: resolve collection (404 absent) → `MembershipRepository.findByUser(userId, collectionId)` → `resolveEffectiveRole` (null→403) → `roleSatisfies(effective, CAPABILITIES[op])` (false→403) → return collection. `requireApiCollectionAccess` becomes `requireApiCapability(..., "collection:read")` (member-or-owner — identical behavior); `requireApiCollectionOwner` becomes a `"collection:manage"`-style owner check; `requireApiResultAccess` unchanged (collection access then `curatorId===userId`).

- [ ] **Step 1 — failing integration tests (un-mocked, real DB):** owner 200/returns collection; curator allowed a `curator` op, **403 on an owner op** (the epic's load-bearing boundary — assert state); non-member 403; absent 404; `requireApiResultAccess` unchanged (member-not-curator 403). Run → FAIL (functions absent).
- [ ] **Step 2 — implement.** **Step 3 — run** → PASS. Verify the three re-expressed guards still pass their existing tests (`sort-results-authz.integration.test.ts`, members). **Step 4 — commit.**

### Task 3.3: transactional owner bootstrap + role display label

**Files:** Modify `src/app/api/collections/route.ts` POST (wrap `createCollection` + owner-membership in `withTransaction` from `src/lib/transactions.ts`). Test: extend `core-routes`/`collection-create` integration — assert (a) owner membership row created with `role:'owner'`, (b) if membership insert fails, no orphan collection (spy-throw inside tx → 0 rows).

- [ ] **Step 1 — failing test** (atomicity: spy `MembershipRepository.prototype.create` reject once → assert 0 collections + 0 memberships). **Step 2 — implement** with `withTransaction`. **Step 3 — run** → PASS. **Step 4 — commit.**

### Task 3.4: stop accepting client flags; members always curator; narrow repo update

**Files:** Modify `src/server/api/invitations.ts` (`CreateInvitationSchema` → drop flag fields, keep `email` only; normalize email `.toLowerCase().trim()`), `src/server/api/members.ts` (`CreateMemberSchema`/`UpdateMemberSchema` → drop flag fields + no `role`), `src/server/repositories/implementations/MembershipRepository.ts` (`update` → explicit allow-list, never role/collectionId/userId from body), `InvitationRepository.ts` (`update` allow-list). Flip any test asserting client-flag persistence.

- [ ] **Step 1 — failing tests:** invitation create ignores body `canManageCollection:true` (not persisted / no longer a field); member add ignores body flags + cannot set role; `MembershipRepository.update` ignores a `role`/`collectionId` in its input. Run → FAIL.
- [ ] **Step 2 — implement** schema + repo allow-list narrowing. **Step 3 — run** → PASS. **Step 4 — commit** `fix(authz): remove client permission-flag/role mass-assignment surface (purses-pv9)`.

### Task 3.5: accept fix (purses-8zcc)

**Files:** Modify `src/app/api/invitations/accept/route.ts` POST; `src/server/api/invitations.ts` (`acceptInvitation` real impl) or inline in route within `withTransaction`. Flip `invitations-routes.integration.test.ts` (accept-creates-membership 0→1; revoked-accept 200→409; add email-mismatch→403, double-accept idempotent).

**Logic:** `getSession`→401; `findByToken`→404; `status!=='pending'`→409; load user by `session.user.id`; `normalizeEmail(user.email) === normalizeEmail(invitation.email)` (lowercase+trim both) else 403; in `withTransaction`: insert `role:'curator'` membership (catch unique-violation → already a member → proceed) + `update(invitation.id, {status:'accepted', acceptedAt:new Date()})`; return 200.

- [ ] **Step 1 — flip + add pins (RED):** pending→membership row (state); revoked→409 + status unchanged; email-mismatch→403 + no membership; double-accept→200 + exactly 1 membership.
- [ ] **Step 2 — implement.** **Step 3 — run** → PASS. **Step 4 — commit** `feat(authz): real invitation accept — create curator membership, guard state+identity (purses-8zcc)`.

### Task 3.6: additive 0006 migration

**Files:** Modify `src/lib/db/schema.ts` only enough for drizzle to NOT generate column drops (no change to flag columns); hand-author `drizzle/0006_authz_role_check.sql` + update `drizzle/meta/_journal.json` (idx 6) + snapshot. SQL per spec §4 (catch-all normalize → two reconcile UPDATEs → `ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','curator'))`, each `--> statement-breakpoint`).

- [ ] **Step 1:** author the SQL + journal/snapshot entries (run `npm run db:generate` only if a schema change warrants it; otherwise hand-author the data/constraint migration following the 0001 multi-statement precedent).
- [ ] **Step 2:** verify it applies: `RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh` (the db-tests job runs `db:migrate` first) → green. Add an integration test asserting a row with `role='admin'` is normalized to `'curator'` (the catch-all) and the CHECK rejects an out-of-domain insert.
- [ ] **Step 3 — commit** `feat(db): 0006 role reconcile + CHECK constraint (additive, purses-crt)`. **Note in PR body:** owner must run `DATABASE_URL=<prod> npm run db:migrate` post-merge (memory `prod-migration-requires-explicit-db-url`).

### Task 3.7: PR3 close-out — gates, `/sync-docs` (API.md authz model → role-based), adversarial-review (security+data+architect), PR, merge (then notify owner re: prod migration), `/close-out` (close purses-crt, purses-89g).

---

# PR4 — Migrate routes to the DAL (purses-g6o; closes 4wj2-A, lgql, yqw, 82r) — new branch off main

**Deliverable:** every collection-scoped route + the flag-reading routes use `requireApiCapability(op)`/resource wrappers; member/invitation management is owner-only; settings pages gate owner.

**Routes to migrate (each: replace inline authz with the capability call; the type still has flag fields so no compile break):**
- `collections/[id]` PATCH/archive/restore/DELETE → `collection:manage` (DELETE→`collection:manage`); `purge`→`collection:purge`; `audit`→`collection:audit`.
- `collections/[id]/items` GET→`items:read`, POST→`items:write`; `items/[itemId]` PATCH→`items:write` (drop `canEditMetadata` read) + belongs-to-parent.
- `items/[itemId]/photos` POST→`photos:write` (drop `canAddPhotos`), `photos/[photoId]` PATCH/DELETE→`photos:write` (drop canAddPhotos/canDeletePhotos), `set-hero`→`photos:write`, `…/file` GET→`items:read`; `pool/upload`→`photos:write` (drop assertCanAddPhotos), `pool/group`/`pool/photos`/`photos/reassign`→`photos:write`/`items:read`.
- `members` GET→`members:read`, POST→`members:manage`; `members/[mid]` GET→`members:read`, PATCH/DELETE→`members:manage` (closes lgql) + belongs-to-parent.
- `invitations` GET→`invitations:read`, POST→`invitations:manage` (closes 4wj2-A); `invitations/[id]` GET→`invitations:read`, PATCH/DELETE/resend→`invitations:manage` (tightens PR1's member-or-owner to owner).
- top-level `items` POST/[id]/restore → `items:write` via `requireApiItemCapability`.

### Task 4.1–4.6 (one per route family above)
Each: **Step 1** flip the relevant pins (lgql member→ now owner-only framing; 4wj2-A canInviteMembers→403 becomes member→403/owner→201; any per-route authz pins) RED. **Step 2** swap inline authz for the capability call/resource wrapper, removing the flag reads. **Step 3** run the family's integration file → PASS. **Step 4** commit per family.

### Task 4.7: page owner-gating (yqw/82r)
**Files:** add `requireCollectionOwnerPage(db, slugOrId, userId)` to `src/lib/collection-access.ts` (shares `resolveEffectiveRole`); use on `collections/[id]/edit`, `items/new`, `items/[n]/edit`, `results/[n]/finalize`, `sort/new` settings/mutation pages. Test via existing page-test pattern (mock getSession/getDb/repos). Verify all 17 pages remain guarded (82r).

### Task 4.8: PR4 close-out — gates, route-level adversarial-review, `/sync-docs` (API.md per-route Access column → role/capability), `/graphify --update`, PR, merge, `/close-out` (close purses-g6o, purses-4wj2, purses-lgql, purses-yqw, purses-82r, purses-nj7).

---

# PR5 — Lock it shut (purses-o03) — new branch off main

### Task 5.1: route-enumeration authz test (filesystem-exhaustive)
**Files:** Create `src/lib/db/route-authz-enumeration.integration.test.ts`.

**Logic:** walk every `route.ts` under `src/app/api/**` (reuse the AST/path approach from `src/lib/__tests__/ui-route-connectivity.test.ts`); derive URL + methods; for each **collection-scoped** route+method, invoke the handler with a **stranger** session (seeded user, not a member) against a seeded collection/resource and assert status ∈ {403,404} (never 200; never a 500 that leaks). Maintain an explicit `PUBLIC_OR_SELF` allowlist (`auth/[...nextauth]`, `auth/signup`, `invitations/accept`, `shared-results/[token]`, `users/me`, `GET·POST /collections`). **Assert exhaustiveness:** every discovered `route.ts` method is either stranger-tested or in the allowlist; an uncategorized route **fails** the test.

- [ ] **Step 1 — write the test;** run → it should PASS now (PR1–PR4 closed the holes) — but first prove it CAN fail: temporarily point one allowlist-omitted route at requireAuth-only and confirm RED, then revert.
- [ ] **Step 2 — commit** `test(authz): filesystem-exhaustive route-enumeration stranger-403/404 backstop (purses-o03)`.

### Task 5.2: PR5 close-out — gates, adversarial-review (QA lens), PR, merge, `/close-out` (close purses-o03; the ESLint half is the deferred bead purses-25ca).

---

# PR6 — Account deletion (purses-hybm) — new branch off main

### Task 6.1: AccountDeletionService (DB-seam, non-vacuous)
**Files:** Create `src/server/services/AccountDeletionService.ts` (mirror `CollectionPurgeService`); Modify `src/server/api/users.ts` `deleteCurrentUser`, `src/app/api/users/me/route.ts` DELETE, `src/server/repositories/implementations/UserRepository.ts` (replace `softDelete` semantics or add `purgeAndScrub`). Test `src/lib/db/account-deletion.integration.test.ts`.

**Logic (per spec §5.6):** for each owned collection — full child-first cascade (shares→result-items→sort-results→decision-events→sessions→preferences→photos→items→invitations→memberships→collection), one `withTransaction` each, collect blob keys. For borrowed collections — delete the user's curator slice child-first (their shares+result-items→their sort-results; their decision-events→their sessions; their preferences; their memberships). Scrub user row: `email→deleted+<id>@deleted.invalid`, `name/image/password/emailVerified→null`; delete `account`+`session`+`verificationToken`(by old email) rows. Best-effort blob `del` post-commit.

- [ ] **Step 1 — flip the hybm pin + write cascade test (RED):** seed an owner with items/photos/sort-results + a curator membership in another owner's collection; assert all populated BEFORE; after DELETE, assert owned-collection rows gone, borrowed curator rows gone (owner's own rows intact), user PII scrubbed, account/session gone, blobs `del`-called. Non-vacuous (drop one delete → test red).
- [ ] **Step 2 — implement.** **Step 3 — run** → PASS. **Step 4 — commit** `feat(privacy): real account deletion — cascade owned data + PII scrub (purses-hybm)`.

### Task 6.2: PR6 close-out — gates, adversarial-review (security+data), `/sync-docs`, PR, merge, `/close-out` (close purses-hybm). Then close the epic purses-pv9 (all in-scope sub-issues done; follow-ups purses-us3d/25ca/wfgj/opir remain open).

---

## Self-review notes
- **Spec coverage:** PR1↔3al/55c/nj7-scope; PR2↔7jds/ydph/zeyd/4wj2-B; PR3↔crt/89g/8zcc + no-client-flags; PR4↔g6o/4wj2-A/lgql/yqw/82r/nj7-owner; PR5↔o03; PR6↔hybm. Deferred: us3d/25ca/wfgj/opir.
- **Type consistency:** `Operation`/`Role`/`CAPABILITIES`/`requireApiCapability`/`resolveEffectiveRole`/`errorResponse`/`FinalizeStateError` names are used identically across tasks.
- **Verify-before-build:** Task 2.1 imports `FinalizeStateError` (Task 2.3) and `UnauthorizedError` (`@/lib/auth`) — sequence 2.3's class before 2.1's import, and confirm the `UnauthorizedError` export name at implementation time.
