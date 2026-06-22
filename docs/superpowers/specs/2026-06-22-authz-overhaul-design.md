# Authorization Overhaul — Design Spec

**Epic:** purses-pv9 · **Date:** 2026-06-22 · **Status:** approved (owner design decisions confirmed; adversarial-reviewed, findings folded in)

Re-derived from current code; the epic's referenced plan doc (`docs/plans/2026-06-14-authz-dal-and-role-simplification.md`) is gone and is **not** the source of truth. This spec is.

## 1. Problem

Collection authorization is hand-rolled across ~17 pages and ~46 API routes behind a 10-boolean-flag model that is **barely enforced**:

- Of ~11 flags, only **3** change an HTTP outcome server-side: `canEditMetadata`, `canAddPhotos`, `canDeletePhotos`. `canManageCollection` *looks* enforced but `CollectionController.canManageCollection` / `MemberController.isCollectionManager` only check `collection.ownerId === userId` (the flag is dead). `canInviteMembers` is read **only in the UI**. The other six gate nothing.
- `membership.role` (`owner`|`curator`) exists in schema + types but **no API route reads it**. Owner identity is `collection.ownerId` everywhere.
- Live cross-tenant **IDOR** holes (`requireAuth`-only, no collection scoping): top-level `/api/items/**` (3al), `/api/invitations/[id]` + resend (nj7), `GET /api/collections/[id]` + `GET …/members` (55c), `…/preferences/*` (caller-scoped, low sev).
- `POST /api/invitations/accept` is a no-op stub: no auth, creates no membership, no state guard (8zcc).
- Client-supplied permission flags are accepted uncapped on invitation-create and member-add/update — a privilege-escalation surface (`canManageCollection: true` from the body).
- Correctness bugs surfaced by the coverage epic: items POST `ZodError`→500 (7jds); finalize has no state guard + sort-result PATCH/share `ZodError`→500 (ydph); account deletion only nulls `emailVerified` (hybm); signup dup-email path is a timing oracle (zeyd). Validation errors map to 500 (no `ZodError`→400 anywhere).

## 2. Confirmed decisions (owner sign-off 2026-06-22)

1. **Collapse to two roles** — `owner` (collection creator) and `curator` (any member). Stop enforcing via the 10 barely-enforced flags; capability derives from role.
2. **Full curator** — a curator may read, run their own (private) sorts, **and mutate shared content**: create/edit/soft-delete/restore items, add/rotate/delete photos, pool ops. Item **purge**, member management, invitations, and collection settings stay **owner-only**.
3. **Account deletion = purge owned data + scrub PII** — cascade-delete every collection the user owns and scrub PII on the user row. Irreversible.

## 3. The role model

### 3.1 Effective-role resolution — `ownerId` is the sole owner source

```
resolveEffectiveRole(collection, membership, userId):
  owner    if collection.ownerId === userId
  curator  if a membership row exists for (collection.id, userId)
  null     otherwise (not a member)
```

`collection.ownerId` is **canonical and sole** for ownership. `membership.role` is a **persisted display label only** (shown in `MemberList`); it is **never read for an authorization decision**. This removes the dual-source drift hazard and the "promote a member to `role:'owner'`" escalation entirely: there is **no role-write path** in the member API — every invited/added member is a curator; the owner is the creator. (Owner *transfer*, if ever wanted, is a separate guarded operation — out of scope.) Curator-private resources (sessions, sort-results) keep their **additional** `curatorId === userId` check — a collection owner does **not** gain access to another curator's private results.

### 3.2 Capability map

`Operation → minimum Role`. `owner` satisfies every operation; `curator` satisfies curator-level operations only.

| Operation | Required | Routes (representative) |
|---|---|---|
| `collection:read` | curator | `GET /collections/[id]` |
| `members:read` | curator | `GET /collections/[id]/members`, `GET …/members/[mid]` |
| `items:read` | curator | `GET /collections/[id]/items`, `GET /items/[id]` |
| `items:write` | curator | create / edit-metadata / soft-delete / restore (collection-scoped **and** top-level `/items`) |
| `photos:write` | curator | upload / rotate / delete / set-hero / pool group / reassign / upload |
| `sessions:write` | curator | `POST /sessions`, decisions (then curator-private) |
| `preferences:write` | curator | preferences items / recalculate |
| `collection:manage` | **owner** | `PATCH /collections/[id]`, archive, restore, `DELETE` (soft) |
| `collection:purge` | **owner** | `POST …/purge` |
| `collection:audit` | **owner** | `GET …/audit` |
| `members:manage` | **owner** | add / update / remove members |
| `invitations:manage` | **owner** | create / read / update / revoke / resend / accept-side invitation ops |
| `items:purge` | **owner** | `POST /items/[id]/purge`, `…/remove-from-sorts` |

Sort-results / shares / sessions-by-id keep `requireApiResultAccess` / `authorizeSession` (curator-private) unchanged. Public token routes (`/accept`, `/shared-results/[token]`, NextAuth, signup) and self routes (`/users/me`, `GET·POST /collections`) are outside the collection capability map.

**`members:read` = curator** is a deliberate, *tighter-than-today* choice (today the roster is `requireAuth`-only). It exposes co-curators' `userId`/membership metadata to fellow members. The member DTO (`mapToMembership`) carries **no email** — verify this holds. (Residual privacy posture noted in §10.)

### 3.3 DAL core (`src/server/dal/`)

- `capabilities.ts` — `Role`, `Operation` unions, `CAPABILITIES: Record<Operation, Role>` (compile-exhaustive), `roleSatisfies(effective, required)`, `resolveEffectiveRole(...)` (per §3.1 — `ownerId`-only; takes `collection` + `membership | null`).
- `requireApiCapability(db, collectionId, userId, op): Promise<Collection | NextResponse>` — resolve collection (404 absent) → membership → effective role (null → 403) → `roleSatisfies` (insufficient → 403) → return collection.
- Resource wrappers resolve a resource to its `collectionId`, then delegate, then enforce belongs-to-parent:
  - `requireApiItemCapability(db, itemId, userId, op)` — resolve item (incl. soft-deleted for lifecycle ops) → 404 absent → `requireApiCapability(item.collectionId, …)` → return item.
  - `requireApiInvitationCapability(db, invitationId, userId, op)` — resolve invitation → `collectionId` → delegate → return invitation.
- Existing `requireApiCollectionAccess` / `requireApiCollectionOwner` / `requireApiResultAccess` are re-expressed on top of the core with **no behavior change** (verified: `requireApiResultAccess` keeps `collection access → curatorId===userId → 403`; arg order `(db, id, userId)` and `instanceof NextResponse` narrowing match all current consumers). This lets PR1's IDOR fix land before the capability map exists.
- The page guard `src/lib/collection-access.ts` (slug-or-id + `redirect`) shares only `resolveEffectiveRole` (the policy predicate); it keeps its own slug-vs-ULID resolution and `Collection | null` + `redirect` shape. Not a second policy.

### 3.4 Existence-oracle posture (403-vs-404), made explicit

Convention (matches existing `requireApiCollectionAccess`/`requireApiResultAccess` precedent): **404 when the resource is absent, 403 when it exists but the caller lacks the capability.** Resource wrappers resolve-then-authorize, so a logged-in stranger can distinguish "no such id" (404) from "exists, not yours" (403). Accepted because path params are **unguessable ULIDs**. "Authz before body parse" (preserved everywhere) refers to never leaking **body validity** to an unauthorized caller — a non-owner with a malformed body gets 403, never a 400 — not to collapsing the resource-existence 404/403 distinction.

## 4. Migration strategy — expand only this epic; contract deferred

The role model works by **reading `role`/`ownerId` instead of flags for enforcement**. `role` already exists and is correctly populated. **This epic does the EXPAND only** — enforcement stops depending on the flags. It does **not** drop the flag columns or the flag fields from the domain types, because the **out-of-scope UI** (`MemberList.tsx`, `members/page.tsx`) still reads `membership.canManageCollection`/`canAddItems` off the domain type; removing the type fields would break `next build` (a CI gate). The flags become **inert** columns/fields the authz layer ignores.

- **No destructive migration this epic.** No merge changes the live schema's columns; CI's `db-tests` job migrate stays trivially green.
- **Additive safety migration** (`0006_*`, role-model PR), hand-authored, all in one file with `--> statement-breakpoint` separators:
  ```sql
  UPDATE memberships SET role='curator' WHERE role NOT IN ('owner','curator');           -- catch-all: stray values would abort the CHECK
  --> statement-breakpoint
  UPDATE memberships m SET role='owner'  FROM collections c WHERE m.collection_id=c.id AND m.user_id=c.owner_id  AND m.role<>'owner';
  --> statement-breakpoint
  UPDATE memberships m SET role='curator' FROM collections c WHERE m.collection_id=c.id AND m.user_id<>c.owner_id AND m.role<>'curator';
  --> statement-breakpoint
  ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','curator'));
  ```
  The `ADD CONSTRAINT … CHECK` takes `ACCESS EXCLUSIVE` and validates every row — **fine at this table's size** (milliseconds); if the table ever grows, switch to `ADD CONSTRAINT … NOT VALID` + `VALIDATE CONSTRAINT`. The catch-all normalize is mandatory: a stray `role` value (legacy/manual) would otherwise abort the migration, and CI's clean ephemeral DB would not catch it before the prod run. Keeps `role` a trustworthy display label. Deploy-safe and additive.
- **prod run:** `0006` is additive; per memory `prod-migration-requires-explicit-db-url`, the owner runs `DATABASE_URL=<prod> npm run db:migrate` (the migrate runner uses a single direct connection `max:1`, correct for DDL). Before the prod run, audit `SELECT DISTINCT role FROM memberships` (the catch-all covers it regardless).
- **Contract (deferred — follow-up bead):** once the UI cluster migrates off the flag fields, a later PR removes the flag fields from the types and the columns from the schema (drizzle generates the DROP — metadata-only, cheap, but **irreversible** data loss, intended). Not in this epic.

Invitations need **no role column**: an invitation always invites a **curator**. The invitation flag columns remain inert (dropped with the deferred contract).

## 5. Fixes by area

### 5.1 IDOR hotfix (PR1, existing chokepoint, ship first)

Scope each `requireAuth`-only hole to its collection using the existing `requireApiCollectionAccess` (member-or-owner) — purely removing cross-tenant access, no capability decisions:

- **3al** — top-level `/api/items`: `POST` gates body-derived `collectionId` via the guarded twin's pattern; `GET·PATCH·DELETE /items/[id]` and `/restore` resolve the item (`findByIdIncludingDeleted` for lifecycle) → `requireApiCollectionAccess(item.collectionId)` → `instanceof NextResponse` early-return. `/purge` + `/remove-from-sorts` already owner-gated.
- **nj7** — `invitations/[id]` GET·PATCH·DELETE + resend: resolve invitation → `requireApiCollectionAccess(invitation.collectionId)` (member-or-owner; the owner-only tightening lands in PR4 with the capability map). Absent invitation → **404** (not 500).
- **55c** — `GET /collections/[id]` + `GET …/members`: add `requireApiCollectionAccess`. Controller-throws → **404** not 500.
- **preferences** — items + recalculate: add `requireApiCollectionAccess` (still caller-scoped).
- **Ride-along framework fixes:** archive/restore absent collection **403→404**; item-restore absent **500→404**.
- Flip the corresponding pinned tests (§6).

### 5.2 Error-handling sweep (PR2, role-independent)

Introduce a shared `errorResponse(error)` HTTP helper and **roll it out across every route in one PR** (no half-migrated state): `SyntaxError`→400, `ZodError`→400 (`{error:"Invalid input", details: error.flatten()}`), `UnauthorizedError`/`"Unauthorized"`→401, typed state errors (`DeleteResultStateError`/`SupersedeStateError`/new `FinalizeStateError`)→409, else 500. Closes:

- **7jds** — wrap `POST /collections/[id]/items` controller call; ZodError→400.
- **4wj2 GAP B** — invitation-create invalid email 500→400.
- **ydph (validation half)** — `sort-results/[id]/items/[rid]` PATCH + `shares` POST + `shares/[sid]` PATCH ZodError→400.
- **ydph (state half)** — add `FinalizeStateError` (mirror `DeleteResultStateError`); guard `ResultController.finalizeResult` (`status==='finalized'`→409); map in route.
- **zeyd** — signup dup-email branch: `await bcrypt.hash(password, 12)` (throwaway) before the early return to equalize timing.

(4wj2's authz half — require owner to invite — lands in PR4; close 4wj2 when both land.)

### 5.3 Role model core (PR3 — crt + 89g)

- DAL core per §3.3 (`resolveEffectiveRole` `ownerId`-only, capability map, `requireApiCapability` + resource wrappers); re-express the three existing guards on top.
- **Owner bootstrap transactional** — wrap `createCollection` + owner-membership insert in `withTransaction` (helper exists, used by `CollectionPurgeService`), closing the orphaned-owner window. Owner membership: `role:'owner'` (display label); flags left at column defaults (inert).
- **Stop accepting client permission flags** — remove the flag fields from `CreateInvitationSchema` and `CreateMemberSchema`/`UpdateMemberSchema`; **no `role` field** on the member schemas (members are always curator). Narrow `MembershipRepository.update`/`InvitationRepository.update` from a blind `...data` spread to an **explicit allow-list** (never `role`/`collectionId`/`userId` from a request body).
- **accept fix (8zcc):** `POST /api/invitations/accept` → require session (401) → resolve invitation by token (404) → guard `status==='pending'` (else 409) → load the **DB user row** by `session.user.id` and compare `normalizeEmail(user.email) === normalizeEmail(invitation.email)` (lowercase + trim, applied to **both** sides; also normalize the email at invitation-create going forward) (else 403) → in one transaction, **insert a `role:'curator'` membership** and set invitation `status:'accepted', acceptedAt`; the `(collectionId,userId)` unique index is the idempotency arbiter — insert with conflict-handling (catch unique-violation / `onConflictDoNothing`), and if already a member, still mark accepted and return 200. `GET /accept` stays public (token preview).
- Additive `0006_*` migration (§4).

### 5.4 Migrate routes to the DAL (PR4 — g6o, closes 4wj2-A + lgql + yqw)

Replace inline per-route authz (`ownerId` checks, `isCollectionManager`, and the **flag reads** at `items/[itemId]` PATCH `canEditMetadata`, `items/[itemId]/photos` POST/PATCH/DELETE `canAddPhotos`/`canDeletePhotos`, `pool/upload` `assertCanAddPhotos`, `photos/reassign`) with `requireApiCapability(op)` / the resource wrappers across `/api/collections/**` + members + invitations + items. **These flag-reading routes are enumerated here explicitly** (the type fields still exist — §4 — so nothing breaks compile; the routes simply stop reading them for authz). Per the capability map, all become `curator` (full-curator) except member/invitation management → `owner` (closes lgql: member-manage owner-only; closes 4wj2-A: invite owner-only). **yqw** (defense-in-depth/UX): settings/mutation **pages** gate owner where the op is owner-only (`requireCollectionOwnerPage`) so curators aren't shown un-submittable forms; the API stays the hard boundary. **82r:** all 17 collection-scoped pages are already guarded (verified) — this PR adds the owner-gating variant only.

### 5.5 Lock it shut (PR5 — o03)

**Route-enumeration authz CI test** (DB integration): walk every `route.ts` under `src/app/api/**`; for each collection-scoped route+method, call it as a **stranger** session and assert `403`/`404` (never `200`/leaky `500`); assert **filesystem-exhaustiveness** — every `route.ts` is either exercised-as-stranger **or** in an explicit `PUBLIC_OR_SELF` allowlist (`/accept`, `/shared-results/[token]`, NextAuth, signup, `/users/me`, `GET·POST /collections`), and an **un-categorized route fails the test**. A new unguarded route → CI red. (The ESLint repo import-boundary is **de-scoped to a follow-up bead** — §10 — because routes pervasively `new XRepository(db)` today and making them repo-free is a large, conditional precondition; the enumeration test is the unconditional backstop.)

### 5.6 Account deletion (PR6 — hybm)

`AccountDeletionService` mirroring `CollectionPurgeService` (children-first hard delete, no FK has `ON DELETE CASCADE`):

- **Owned collections** — for each, the full cascade: `sort_result_shares → sort_result_items → sort_results → decision_events → sessions → preferences → photos → items → invitations → memberships → collection`, one `withTransaction` per collection (note: not a single atomic account-delete — partial failure leaves some collections purged; acceptable, logged).
- **Borrowed collections** (the user is a curator in someone else's collection) — delete the user's **curator-scoped slice child-first** to respect the no-cascade FKs: their `sort_result_shares` + `sort_result_items` **before** their `sort_results`; their `decision_events` **before** their `sessions`; then their `preferences`, then their `memberships`. (A by-curator slice inside a live collection — the codebase has no prior precedent; enumerate the order explicitly.)
- **User row + auth** — scrub PII: `email`→ a per-id tombstone (`deleted+<id>@deleted.invalid`, satisfies the unique index), `name`/`image`→null, `password`→null, `emailVerified`→null; delete `account` + `session` rows and any `verificationToken` rows for the old email (so no stale magic-link resolves).
- **Blobs** — best-effort `del` after commit (established pattern; a failure is logged, not rolled back).
- Wire through `UserController.deleteCurrentUser` + the DELETE route. Flip the hybm pin (soft-delete → real delete/scrub).

## 6. Testing

Integration-over-mocked for **every** authz path (memory `integration-over-mocked-for-authz`): mock only `getSession` (+ `@vercel/blob` where blobs are touched); real DAL/repos/Postgres; `describeDb = RUN_DB_TESTS==='1' ? describe : describe.skip` (verified: the CI `db-tests` job runs `RUN_DB_TESTS=1 … --no-file-parallelism src/lib/db` against real Postgres; **not** skipped in the gate job). Seed via repos; `resetDb` per test; assert **state**, not just status, on negative paths. Reuse `e2e/fixtures/mock-auth.ts`, `seed.ts`, `db.ts`.

**TDD-in-reverse for the pins:** flip each pinned assertion to intended = RED, make product code GREEN, delete the pin comment. **The flip set is enumerated by file + test name below (authoritative — do NOT rely on grepping a `pv9` tag; ~2 files tag with `ydph`/`hybm`/`GAP`, not `pv9`):**

- `collection-items-routes`: items/[id] GET·PATCH·DELETE IDOR 200→403 (+state); 7jds create 500→400.
- `collection-invitations-routes`: canInviteMembers 201→403 (PR4); missing/malformed email 500→400 (PR2).
- `invitations-routes`: nj7 GET·PATCH·DELETE·resend 200→403; accept-creates-membership 0→1; revoked-accept 200→409; absent invitation 500→404.
- `core-routes`: 55c GET collection 500→404 (+stranger 403); items-POST stranger 201→403; items 500→400; signup timing (constant-work).
- `lifecycle-routes`: 55c members stranger 200→403; archive/restore absent 403→404; 3al item-restore 200→403; restore absent 500→404.
- `members-routes`: lgql — member-management is owner-only under the role model (the flagged member stays 403; update the pin's framing from "flag ignored" to "role-derived owner-only").
- `sort-results-pipeline`: finalize re-finalize 200→409; bad enum 500→400.
- `public-account-routes`: hybm DELETE soft→real delete/scrub; empty-name PATCH 500→400.

**New tests (each names a seam-crossing, un-mocked obligation):**
- DAL `resolveEffectiveRole` unit — including the **owner-via-`ownerId`-with-no-membership-row** branch (reachable for legacy/reconciled data) and the curator/none branches.
- **Capability boundary (the epic's load-bearing behavior):** a real **curator** session is `200` on a curator-op route (e.g. edit item) **and** `403` on an owner-op route (e.g. `members:manage`, `collection:purge`) — assert state, through real routes. Not covered by the stranger enumeration.
- Un-mocked integration for `requireApiCollectionAccess` (55c.2).
- accept-flow integration: pending→curator membership created (state); revoked/accepted→409; email-mismatch→403; double-accept idempotent (unique-index arbiter).
- account-deletion cascade integration: non-vacuous (every owned + borrowed-collection table populated before, gone after; user PII scrubbed; `account`/`session`/`verificationToken` gone).
- route-enumeration authz test (stranger 403/404 + filesystem-exhaustiveness).

**Coverage:** keep the merged floor (`ci.yml` "Merged coverage floor", currently **82**) ≥82, all tiers green. DB tests run serially (`--no-file-parallelism`); parallel authors never commit / run `bd` concurrently (memory `parallel-test-workflow`).

## 7. PR sequence

1. **IDOR hotfix** (3al, nj7-scope, 55c, preferences, ride-along 404s) — existing chokepoint, ship first.
2. **Error-handling sweep** — `errorResponse` helper + full rollout; finalize 409 state guard; signup timing (fixes 7jds, ydph, zeyd, 4wj2-B). Role-independent.
3. **Role model core** (crt + 89g): DAL core (`ownerId`-only role), owner-bootstrap tx, stop-accepting-client-flags, members-always-curator, repo update allow-list, accept fix (8zcc), additive `0006` migration.
4. **Migrate `/api/collections/**` + flag-reading routes to the DAL** (g6o) + page owner-gating — closes 4wj2-A, lgql, yqw, 82r.
5. **Lock it shut** (o03): route-enumeration authz test (exhaustive).
6. **Account deletion** (hybm).

Each PR: TDD (flip pins first), per-task + whole-branch `adversarial-review` (security/data/architect lenses), `verification-before-completion` (evidence), `/sync-docs` (update `docs/API.md` authz model + Known-gaps; never PRODUCT/TONE) + `/graphify --update` before push, rebase onto `origin/main` if behind, merge when CI green, then `/close-out`.

## 8. Out of scope

UI cluster (purses-o93 etc.); e2e (purses-7dd / T9–T15); purses-c0w (surface role in profile/UI). The **contract migration** (dropping the inert flag columns/types) is deferred (§4, §10) because the out-of-scope UI still reads the flag fields.

## 9. Risks

- **Curator loosening:** curators now mutate shared items/photos (confirmed full-curator). Item soft-delete is recoverable (restore is curator-level too; purge stays owner-only). **Photo delete is an irreversible blob delete** available to any curator — accepted under the trusted-collaborator model; tracked follow-ups in §10 (audit attribution; option to make photo-delete owner-only).
- **Cross-curator soft-delete is unattributed** — `audit_log` records only `purge`. Accepted for this epic; follow-up in §10.
- **Migration:** additive-only this epic → no merge forces a destructive prod migration. `0006` is a small validating lock (fine at size); the catch-all normalize prevents a stray-`role` abort that CI wouldn't catch.
- **accept identity binding:** matching the **DB-canonical** user email (not `session.email`) against the normalized invitation email; existing mixed-case invitation rows are handled because both sides are normalized at compare time.
- **Display drift:** while the flag columns stay inert, `MemberList` permission badges reflect stale flag values. The UI is out of scope; the badges are display-only. Resolved by the deferred contract + UI migration.

## 10. Deferred / follow-up beads (file during the epic)

- **Drop inert flag columns + type fields** (the contract migration) — after the UI cluster migrates off `membership.canX`.
- **ESLint repo import-boundary** (`no-restricted-imports` forbidding `@/server/repositories/implementations/*` from `src/app/api/**`) — after routes are made repo-free; the route-enumeration test is the backstop until then.
- **Soft-delete audit attribution** — add a soft-delete `audit_log` action so cross-curator item/photo deletes are attributable.
- **Reconsider photo-delete as owner-only** — if the irreversible-blob-delete-by-any-curator risk proves too sharp in practice.
- **Roster privacy** — confirm `members:read=curator` is the desired posture; verify the member DTO never carries email.
