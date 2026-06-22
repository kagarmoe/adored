# Authorization Overhaul — Design Spec

**Epic:** purses-pv9 · **Date:** 2026-06-22 · **Status:** approved (design decisions confirmed by owner)

Re-derived from current code; the epic's referenced plan doc (`docs/plans/2026-06-14-authz-dal-and-role-simplification.md`) is gone and is **not** the source of truth. This spec is.

## 1. Problem

Collection authorization is hand-rolled across ~17 pages and ~40 API routes behind a 10-boolean-flag model that is **barely enforced**:

- Of ~11 flags, only **3** change an HTTP outcome server-side: `canEditMetadata`, `canAddPhotos`, `canDeletePhotos`. `canManageCollection` *looks* enforced but `CollectionController.canManageCollection` / `MemberController.isCollectionManager` only check `collection.ownerId === userId` (the flag is dead). `canInviteMembers` is read **only in the UI**. The other six (`canAddItems`, `canDeleteItems`, `canSort`, `canViewOutputs`, `canViewResults`, `canCreateSession`) gate nothing.
- `membership.role` (`owner`|`curator`) exists in schema + types but **no API route reads it**. Owner identity is `collection.ownerId` everywhere.
- Live cross-tenant **IDOR** holes remain (`requireAuth`-only, no collection scoping): top-level `/api/items/**` (3al), `/api/invitations/[id]` + resend (nj7), `GET /api/collections/[id]` + `GET …/members` (55c), `…/preferences/*` (caller-scoped, low sev).
- `POST /api/invitations/accept` is a no-op stub: no auth, creates no membership, no state guard (8zcc).
- Several validation/state correctness bugs surfaced by the coverage epic: items POST `ZodError`→500 (7jds); finalize has no state guard + sort-result PATCH/share `ZodError`→500 (ydph); account deletion only nulls `emailVerified` (hybm); signup dup-email path is a timing oracle (zeyd).

## 2. Confirmed decisions (owner sign-off 2026-06-22)

1. **Collapse to two roles** — `owner` (collection creator) and `curator` (any member). Drop the 10 barely-enforced flags; capability derives from role.
2. **Full curator** — a curator may read, run their own (private) sorts, **and mutate shared content**: create/edit/soft-delete/restore items, add/rotate/delete photos, pool ops. Item **purge**, member management, invitations, and collection settings stay **owner-only**.
3. **Account deletion = purge owned data + scrub PII** — cascade-delete every collection the user owns (items, photos, blobs, sessions, results) and scrub PII (`email`/`name`/`password`/`image`) on the user row. Irreversible.

## 3. The role model

### 3.1 Effective-role resolution (single source)

```
resolveEffectiveRole(collection, membership, userId):
  owner    if collection.ownerId === userId  OR  membership?.role === 'owner'
  curator  if membership exists
  null     otherwise (not a member)
```

`collection.ownerId` stays the canonical bootstrap owner; `membership.role` is the persisted label (kept consistent on write, used for display and future co-owners). Curator-private resources (sessions, sort-results) keep their **additional** `curatorId === userId` check — a collection owner does **not** gain access to another curator's private results.

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
| `invitations:manage` | **owner** | create / read / update / revoke / resend invitations |
| `items:purge` | **owner** | `POST /items/[id]/purge`, `…/remove-from-sorts` |

Sort-results / shares / sessions-by-id keep `requireApiResultAccess` / `authorizeSession` (curator-private) unchanged. Public token routes (`/accept`, `/shared-results/[token]`, NextAuth, signup) and self routes (`/users/me`, `GET·POST /collections`) are outside the collection capability map.

### 3.3 DAL core (`src/server/dal/`)

- `capabilities.ts` — `Role`, `Operation` unions, `CAPABILITIES: Record<Operation, Role>` (compile-checked exhaustive), `roleSatisfies(effective, required)`, `resolveEffectiveRole(...)`.
- `requireApiCapability(db, collectionId, userId, op): Promise<Collection | NextResponse>` — resolve collection (404 absent) → membership → effective role (null → 403) → `roleSatisfies` (insufficient → 403) → return collection.
- Resource wrappers resolve a resource to its `collectionId`, then delegate, then enforce belongs-to-parent:
  - `requireApiItemCapability(db, itemId, userId, op)` — resolves item (incl. soft-deleted for lifecycle ops) → 404 absent → `requireApiCapability(item.collectionId, …)` → returns item.
  - `requireApiInvitationCapability(db, invitationId, userId, op)` — resolves invitation → `collectionId` → delegate → returns invitation.
- Existing `requireApiCollectionAccess` / `requireApiCollectionOwner` / `requireApiResultAccess` are re-expressed on top of the core (no behavior change for already-correct routes), so PR1's IDOR fix can land before the capability map exists.
- The page guard `src/lib/collection-access.ts` (slug-or-id + `redirect`) shares `resolveEffectiveRole` but keeps its own resolution/return shape. `lib/collection-access` becomes a thin consumer of the shared resolver; not a second policy.

## 4. Migration strategy — expand / contract (deploy-safe)

The role model works by **reading `role` instead of flags**. `role` already exists and is correctly populated (owner rows `role='owner'`; everyone else `'curator'`), so **no row backfill is required for correctness** and **no destructive migration is forced by any merge**.

- **Expand (role-model PRs):** stop reading/writing the flags in code and types; **keep the flag columns in `schema.ts`** (so drizzle generates no DROP). Flags become nullable/defaulted columns the code ignores. Membership inserts omit them (columns default).
- **Additive safety migration** (`0006_*`, role-model PR): defensive reconcile then a CHECK constraint, in one file:
  ```sql
  UPDATE memberships m SET role='owner'  FROM collections c WHERE m.collection_id=c.id AND m.user_id=c.owner_id  AND m.role<>'owner';
  --> statement-breakpoint
  UPDATE memberships m SET role='curator' FROM collections c WHERE m.collection_id=c.id AND m.user_id<>c.owner_id AND m.role NOT IN ('curator');
  --> statement-breakpoint
  ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','curator'));
  ```
  Hand-authored into the generated migration. Deploy-safe (additive).
- **Contract (final PR):** remove the flag columns from `schema.ts` → drizzle generates the DROP (`0007_*`). Deploy-safe **only because** code already stopped referencing them. CI's `db-tests` job runs `db:migrate` against its ephemeral Postgres, so CI stays green. The **prod run is deferred to an owner step** (`DATABASE_URL=<prod> npm run db:migrate`, per memory `prod-migration-requires-explicit-db-url`); dropping unused columns is order-independent with deploy. The spec does not auto-run a prod migration.

Invitations need **no role column**: an invitation always invites a **curator** (owner is unique, never invited). Accept creates a `role='curator'` membership. The 8 invitation flag columns are dropped in the contract step.

## 5. Fixes by area

### 5.1 IDOR hotfix (PR1, existing chokepoint, ship first)

Scope each `requireAuth`-only hole to its collection using the existing `requireApiCollectionAccess` (member-or-owner) — purely removing cross-tenant access, no capability decisions:

- **3al** — top-level `/api/items`: `POST` gates body-derived `collectionId` via the guarded twin's pattern; `GET·PATCH·DELETE /items/[id]` and `/restore` resolve the item (`findByIdIncludingDeleted` for lifecycle) → `requireApiCollectionAccess(item.collectionId)` → `instanceof NextResponse` early-return. `/purge` + `/remove-from-sorts` already owner-gated.
- **nj7** — `invitations/[id]` GET·PATCH·DELETE + resend: resolve invitation → `requireApiCollectionAccess(invitation.collectionId)` (member-or-owner; the owner-only tightening is PR2/PR3). Absent invitation → **404** (not 500).
- **55c** — `GET /collections/[id]` + `GET …/members`: add `requireApiCollectionAccess`. Controller-throws → **404** not 500.
- **preferences** — items + recalculate: add `requireApiCollectionAccess` (still caller-scoped).
- **Ride-along framework fixes:** archive/restore absent collection **403→404**; item-restore absent **500→404**.
- Flip the corresponding pinned tests (see §6).

### 5.2 Role model core (PR2 — crt + 89g)

Capability map + `requireApiCapability` + resource wrappers + `resolveEffectiveRole`; re-express the three existing guards on top. Update write paths to role: owner bootstrap (`role:'owner'`, omit flags); member add/update sets `role`; **invitation create no longer accepts client flags** (privilege-escalation surface removed) — it just records the invitee email. Drop the flag fields from `CollectionMembership`/`Invitation` **types** and repo create/map (columns stay). Introduce a shared `errorResponse(error)` HTTP helper (SyntaxError/ZodError→400, Unauthorized→401, typed state errors→409, else 500) and apply it where invitations/members validation is touched (fixes 4wj2 GAP B 500→400). Additive `0006_*` migration. **Dissolves** 4wj2 (canInviteMembers→owner via `invitations:manage`), lgql (isCollectionManager→`members:manage`), yqw (page-level — see PR3).

**accept fix (8zcc):** `POST /api/invitations/accept` → require session (401) → resolve invitation by token (404) → guard `status==='pending'` (else 409) → match normalized `session.email === invitation.email` (else 403) → **create `role:'curator'` membership** + set `status:'accepted', acceptedAt` **in one transaction**; if a membership already exists for `(collectionId,userId)`, mark accepted and return 200 (idempotent). `GET /accept` stays public (token preview).

### 5.3 Migrate routes to the DAL (PR3 — g6o)

Replace inline per-route authz (`ownerId` checks, `canX` flag reads, `isCollectionManager`) across `/api/collections/**` + members + invitations + items with `requireApiCapability(op)` / the resource wrappers. Removes direct repo reaches where the guard already returns the entity. **yqw** (defense-in-depth): settings/mutation **pages** gate on owner where the operation is owner-only (`requireCollectionOwnerPage`) so curators aren't shown un-submittable forms; the API remains the hard boundary. **82r:** all 17 collection-scoped pages are already guarded (verified) — this PR adds the owner-gating variant only.

### 5.4 Lock it shut (PR4 — o03)

- **Route-enumeration authz CI test** (DB integration): enumerate every collection-scoped `/api/**` route, call as a **stranger** session, assert `403`/`404` (never `200`/leaky `500`), with an allowlist for public + self routes. A new unguarded route → CI red.
- **ESLint import boundary:** `no-restricted-imports` in `.eslintrc.js` `overrides` for `src/app/api/**` forbidding `@/server/repositories/implementations/*` (+ deep relative). Enabled after PR3 leaves routes repo-free; any genuine gap gets a controller/DAL method. If a route legitimately can't be made repo-free this round, the route-enumeration test alone satisfies the "lock it shut" intent and the rule ships in a follow-up.

### 5.5 Correctness bugs (PR5)

- **7jds** — wrap `POST /collections/[id]/items` controller call; `errorResponse` (ZodError→400).
- **ydph** — add `FinalizeStateError` (mirror `DeleteResultStateError`); guard `ResultController.finalizeResult` (`status==='finalized'`→409); map in route. Add ZodError→400 to `sort-results/[id]/items/[rid]` PATCH + `shares` POST + `shares/[sid]` PATCH (via `errorResponse`).
- **zeyd** — signup dup-email branch: `await bcrypt.hash(password, 12)` (throwaway) before the early return to equalize timing.

### 5.6 Account deletion (PR6 — hybm)

`AccountDeletionService` mirroring `CollectionPurgeService`: in one transaction per owned collection, cascade-delete (shares → result-items → sort-results → decision-events → sessions → preferences → photos → items → invitations → memberships → collection); delete the user's curator-scoped rows in collections owned by others (preferences, sort-results, sessions, memberships); scrub `user` PII (`email`→a tombstone like `deleted+<id>@…`, `name`/`image`→null, `password`→null) and delete `account`/`session` rows; best-effort blob `del` post-commit. Wire through `UserController.deleteCurrentUser` + the DELETE route. Flip the hybm pin (soft-delete → real delete/scrub).

## 6. Testing

Integration-over-mocked for **every** authz path (memory `integration-over-mocked-for-authz`): mock only `getSession` (+ `@vercel/blob` where blobs are touched); real DAL/repos/Postgres; `describeDb = RUN_DB_TESTS==='1' ? describe : describe.skip`; seed via repos; `resetDb` per test; assert **state**, not just status, on negative paths. Reuse `e2e/fixtures/mock-auth.ts`, `seed.ts`, `db.ts`.

**TDD-in-reverse for the pins:** each pinned test (tagged `// pins current behavior … pv9`) is flipped to the intended assertion = RED, then product code makes it GREEN, then the pin comment is deleted. Flip set (file → intended):

- `collection-items-routes`: items/[id] GET·PATCH·DELETE IDOR 200→403 (+state); 7jds 500→400.
- `collection-invitations-routes`: canInviteMembers 201→403; missing/malformed email 500→400.
- `invitations-routes`: nj7 GET·PATCH·DELETE·resend 200→403; accept-creates-membership 0→1; revoked-accept 200→409; absent invitation 500→404.
- `core-routes`: 55c GET collection 500→404 (+stranger 403); items-POST stranger 201→403; items 500→400; signup timing (constant-work).
- `lifecycle-routes`: 55c members stranger 200→403; archive/restore absent 403→404; 3al item-restore 200→403; restore absent 500→404.
- `members-routes`: lgql manager-flag→ in role terms member-management is owner-only (the flagged member stays 403; the pin's framing updates to role).
- `sort-results-pipeline`: finalize re-finalize 200→409; bad enum 500→400.
- `public-account-routes`: hybm DELETE soft→real delete/scrub; empty-name PATCH 500→400.

Add new: DAL `requireApiCapability` unit + DB-seam tests; un-mocked integration for `requireApiCollectionAccess` (55c.2); accept-flow integration; account-deletion cascade integration (non-vacuous: every table populated before, gone after); route-enumeration authz test.

**Coverage:** keep the merged floor (`ci.yml` "Merged coverage floor", currently **82**) ≥82, all tiers green. Bump only if a PR meaningfully raises real coverage. DB tests run serially (`--no-file-parallelism`); parallel authors never commit / run `bd` concurrently (memory `parallel-test-workflow`).

## 7. PR sequence

1. **IDOR hotfix** (3al, nj7-scope, 55c, preferences, ride-along 404s) — existing chokepoint, ship first.
2. **Role model core** (crt + 89g): capability map, DAL core, role write-paths, accept fix (8zcc), `errorResponse` helper, additive `0006_*` migration. Dissolves 4wj2/lgql.
3. **Migrate `/api/collections/**` routes to the DAL** (g6o) + page owner-gating (yqw/82r).
4. **Lock it shut** (o03): route-enumeration authz test + ESLint import boundary.
5. **Correctness bugs** (7jds, ydph, zeyd) + finish `errorResponse` rollout.
6. **Account deletion** (hybm).
7. **Contract migration** (`0007_*`): drop unused flag columns (dev-run here; prod run deferred to owner).

Each PR: TDD (flip pins first), per-task + whole-branch `adversarial-review` (security/data/architect lenses), `verification-before-completion` (evidence), `/sync-docs` (update `docs/API.md` authz model + Known-gaps; never PRODUCT/TONE) + `/graphify --update` before push, rebase onto `origin/main` if behind, merge when CI green, then `/close-out`.

## 8. Out of scope

UI cluster (purses-o93 etc.); e2e (purses-7dd / T9–T15); purses-c0w (surface role in profile/UI) unless the role model makes it trivial.

## 9. Risks

- **Curator loosening:** curators now delete shared items/photos (confirmed intended — full-curator). Net change vs today: `canDeletePhotos`/`canDeleteItems` were default-false/unenforced; deletes are recoverable (soft-delete; purge stays owner-only).
- **Migration/deploy ordering:** mitigated by expand/contract — no merge forces a destructive prod migration; the column drop is order-independent.
- **accept identity binding:** matching `session.email === invitation.email` requires the invitee to sign up with the invited email; that is the intended, secure binding.
- **ESLint boundary blast radius:** routes pervasively `new XRepository(db)` today; the rule lands only after PR3 makes routes repo-free, with the route-enumeration test as the guaranteed backstop.
