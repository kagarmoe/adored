# Authorization: DAL + Owner/Curator role simplification — plan

**Date:** 2026-06-14 · Synthesized from a security-engineer review + an architecture review of the live codebase, plus the owner's decision to collapse the permission model to **two roles**.

## TL;DR

Collection authorization is hand-rolled in ~17 pages **and** ~40 API routes across **two route families**, with a 10-flag permission model that is barely and inconsistently enforced. #186 closed the page-**read** IDOR but left live cross-tenant **write** holes in the API. The fix is three moves, in order:

1. **Hotfix the confirmed live holes now** (P0 — independent of the refactor).
2. **Simplify the model to Owner + Curator** and consolidate the duplicate routes (shrinks the surface).
3. **Route all collection access through one DAL chokepoint**, with repos made import-private so a new route *cannot* forget the guard.

## Confirmed live vulnerabilities (verified against the code, 2026-06-14)

These are exploitable on prod **now**. Severity per the security review:

| # | Route | Hole | Impact |
|---|---|---|---|
| P0-1 | `GET /api/collections/[id]/invitations` | `requireAuth()` then `listInvitations()` — **no collection scope** | Global leak of **all** invite tokens + emails → collection/account takeover |
| P0-2 | `POST /api/collections/[id]/invitations` | auth only, no `canInviteMembers`/owner check | Invite yourself into any collection (takeover chain with P0-1) |
| P0-3 | `POST /api/sessions/[id]/decisions` | `getSession()` only — no membership check on the session's collection | Cross-tenant **write**: poison another tenant's sort results |
| P0-4 | `POST /api/sessions`, `PATCH/DELETE /api/sessions/[id]` | auth only | Create/mutate/delete sessions in any collection |
| P0-5 | `GET/POST /api/collections/[id]/items` | `requireAuth()` only | List/add items in any collection |
| P0-6 | `POST /.../items/[itemId]/photos/[photoId]/set-hero` | `getSession()` only; `params.id` ignored | Cross-tenant tamper |
| P0-7 | `members/[mid]` PATCH/DELETE | checks manager-of-`[id]` but mutates `[mid]` with no belongs-to-parent | Cross-collection member mutation |

Also: `sort/[sessionId]` pages (+triage/compare) never check `session.collectionId === params.id` (the read/UI half of P0-3); `canManageCollection` is a `TODO` that always returns false (owners-only manage today); several routes 403 an **owner** who lacks a membership row.

## Root cause (answering "why so many roles, flags, routes?")

The complexity **is** the vulnerability. Ten granular flags were speculative for a gentle small-group app and were never wired consistently; two overlapping route families (`/api/collections/[id]/sessions/…` **and** a flat `/api/sessions/[id]/…`) meant there was no single way in to guard — so authz got hand-rolled, inconsistently, and forgotten. The fix reduces surface, not just adds checks.

## The model: Owner + Curator (owner decision, 2026-06-14)

Collapse the 10 booleans to **one `role`** on the membership (owner is implicit via `collection.ownerId`). Capabilities derive from role:

| Capability | Owner | Curator |
|---|:---:|:---:|
| View collection, items, results | ✅ | ✅ |
| Add / edit / delete items & photos | ✅ | ✅ |
| Run sort sessions, record decisions, finalize a result | ✅ | ✅ |
| Edit collection settings (name, etc.) | ✅ | ❌ |
| Manage members + invitations | ✅ | ❌ |
| Archive / restore / **purge** / delete the collection | ✅ | ❌ |
| Create / revoke public **share** links | ✅ | ❌ (judgment call — see open Qs) |

The boundary: **Curator curates the contents; Owner controls the collection** (settings, people, lifecycle, publishing).

**Open judgment calls for the owner to confirm during the plan:** (a) can a Curator create public *share links*, or is publishing owner-only? (b) can a Curator *delete the whole* set of items, or only individual items? (default in the table: share = owner-only; item delete = allowed).

## Architecture: one DAL chokepoint (Option A)

A `src/server/dal/` module is the **only** sanctioned way to touch collection-scoped data. Repos stay pure; pages and routes call the DAL.

- `resolveAccess(db, userId, collectionId) → CollectionAccess | null` — one round-trip (collection + membership in parallel); owner-implicit handled **once**; `.can(capability)` derives from role.
- `requireCollectionAccess(db, userId, collectionId, capability?)` — pages; `redirect()` on deny (keeps #186's contract).
- `requireApiAccess(db, userId, collectionId, capability?) → CollectionAccess` — routes; throws `AccessDeniedError(403|404)` mapped by a standard catch.
- `requireItem / requirePhoto / requireSession / requireResult / requireMember` — belongs-to-parent guards (walk the resource to its `collectionId` and assert it equals the authorized one) — closes the nested-resource confusion class in one place.
- **Scoped writes:** the DAL's write primitive pushes tenancy into the SQL (`UPDATE/DELETE … WHERE id = ? AND collection_id = ?`) so a stale authz read can't authorize a write to a moved row (neon-http has no transactions → no TOCTOU reliance).
- **Structural enforcement:** an ESLint `no-restricted-imports` rule forbids importing `@/server/repositories/implementations/*` from `src/app/**` — the only way to reach data from a route/page is through the DAL, so a new route **can't** forget the guard. Plus a **route-enumeration test** that globs every `src/app/api/**/route.ts`, hits each as a non-member, and asserts 403/404 by default (explicit allowlist for the deliberate public exceptions: `/api/auth`, the Blob upload-completed callback, `/shared-results/[token]`).

## Phased delivery (each PR green + shippable)

- **PR 1 — P0 hotfix (urgent, ship first).** Add the existing member-or-owner guard + belongs-to-parent to the 7 confirmed holes (incl. scoping `listInvitations` to the collection, guarding `/api/sessions/**` writes, the `set-hero` and `members/[mid]` belongs-to-parent, and the sort-session `collectionId` check). Closes the live cross-tenant write/leak today, before the refactor. Route tests per hole (incl. the owner-without-membership regression).
- **PR 2 — DAL core + role capability map.** `src/server/dal/` (resolveAccess, requireApiAccess, requireCollectionAccess, nested guards, scoped-write primitive) with the Owner/Curator capability map (`satisfies Record<Operation, Capability>` so a new op fails to compile until mapped). Unit + DB-seam tests. `lib/collection-access.ts` becomes a shim delegating to the DAL.
- **PR 3 — Role data migration.** Schema: add `membership.role` (`owner`/`curator`); migrate existing rows (any flag-bearing member → `curator`); update invitation/membership creation to set role; keep the old booleans for one release or drop them. Dev + prod Neon migration (held for deploy).
- **PR 4 — Migrate `/api/collections/**` routes to the DAL** (replace inline checks with `requireApiAccess(capability)` + nested guards). Removes the per-route `isOwner` copy-paste.
- **PR 5 — Consolidate + guard the second route family** (`/api/sessions/**`, `/api/preferences/**`): either fold under the collection-scoped tree or guard via the DAL with belongs-to-parent. This is where the worst writes lived.
- **PR 6 — Lock it shut.** ESLint import-boundary rule + the route-enumeration CI test; migrate pages to import the DAL directly; delete the shim. After this, "a new route forgets the guard" fails CI.

## Testing strategy

- **Cross-tenant negative matrix** (the core), un-mocked against the test DB (`RUN_DB_TESTS=1`, the `db-tests` CI job): two collections, attacker is a member of A only; for every resource × operation, attacker-on-B → 403/404. Includes the P0-3 decisions write and the nested-session cases explicitly.
- **Capability granularity:** a Curator is denied owner-only operations (settings, members, purge, share); allowed curation operations.
- **Owner-implicit:** owner with no membership row passes everything.
- **Regression prevention:** the import-boundary lint + route-enumeration test make "forgetting" a CI failure, not a hope.

## Risks

- **Behavior change:** routes that returned data to any authed user now 404 non-members — correct, but any client code assuming "authed = authorized" breaks; smoke-test the app per PR.
- **Role migration:** collapsing flags may expand or contract a real member's access; inspect prod memberships before PR 3 and decide per-collection if needed.
- **Prod Neon migration** (PR 3) follows the held-for-deploy pattern (see `prod-migration-requires-explicit-db-url` memory).
- **Scope:** ~40 routes + 17 pages + a schema migration. ~6 PRs; the P0 hotfix is hours, the rest is the structural work.

## Open questions for the owner

1. Curator + public **share links**: owner-only (default) or curator too?
2. Curator + **delete items**: allowed (default) or owner-only?
3. The flat `/api/sessions/**` + `/api/preferences/**` routes — consolidate under `/api/collections/[id]/…` (cleaner, one tree) or just guard in place (less churn)? (Recommend consolidate.)
