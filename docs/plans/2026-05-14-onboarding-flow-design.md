# Onboarding Flow — Design Document

Date: 2026-05-14
Bead: purses-72e
Author: polecat nux
Status: **APPROVED with changes — 2026-05-14 (Kimberly, via mayor/ hq-wisp-6npw)**

## Amendment — Approved with Changes (2026-05-14)

Kimberly approved Phase 4 implementation. Her answers to the four Open Questions
amend the design below. Where this section conflicts with the original text, **this
section wins**.

- **Q1 — confirmed as recommended.** Invites only; no join-by-code / global
  directory. A brand-new user with no pending invites sees a create-only
  onboarding screen.
- **Q2 — changed: send the invite email in v1.** When an operator adds a curator
  by email, the app sends that person a templated Resend invite email. Adds
  `lib/email.ts` (`sendInviteEmail`) to scope; `addCuratorByEmail` calls it
  best-effort (a Resend failure is logged, not fatal — the membership/invite is
  the source of truth).
- **Q3 — roles are HIERARCHICAL, not parallel.** "operators are not curators,
  but curators are operators." A **curator** membership has *all* operator
  capabilities (manage content) **plus** ranking/curating — curator is the
  higher privilege. An **operator** membership can manage content only and
  **cannot rank**. The authz helper is hierarchical:
  - `assertCollectionRole(c, u, 'operator')` → passes if the membership role is
    `operator` **or** `curator`.
  - `assertCollectionRole(c, u, 'curator')` → passes **only** if the role is
    `curator`.
  Capability → required level:
  - Manage content (create/update item, upload/toggle photo, the
    `/collections/*` pages, `addCuratorByEmail`, create collection) → `'operator'`.
  - **View** rankings (the `/[id]` ranked-tier view via `getCollection`) →
    `'operator'`. Operators CAN see rankings — confirmed by Kimberly on PR #12
    review (mayor/ hq-wisp-0lin, 2026-05-14).
  - **Rank** — the ranking *actions* `getNextPair` / `submitComparison`
    (`actions/ranking.ts`) → `'curator'`. Operators cannot submit comparisons.
  So the only thing gated to `'curator'` is the act of ranking; everything else
  (content management and viewing results) is `'operator'`-level, which a
  curator also satisfies via the hierarchy.
- **Q4 — demo-only preservation + migration latitude.** Only the demo user
  (`demo-owner@purseinator.local`) and the `isDemo` collection must survive.
  Migrations were hand-applied to Neon. **Decision:** keep appending — add one
  new migration after the existing three (they are already applied on prod;
  squashing risks divergence with no upside on a hand-managed DB). The migration
  still backfills *all* collections' owner memberships before dropping
  `User.role` — it is one deterministic `INSERT…SELECT`, costs nothing, and
  guarantees demo survival without depending on a post-deploy seed run.

**Gating update:** purses-90i is **merged** — `lib/authz.ts` already exists with
`assertCollectionOwner` / `assertItemOwner`. Phase 4 *replaces* those with the
hierarchical `assertCollectionRole` / `assertItemRole`. purses-0zq concluded the
`auth.ts` bug is environmental (AUTH_SECRET/domain), not code — Phase 4 does not
block on it.

## What We're Building

A first-run onboarding flow and a per-collection role model. Today a brand-new
person literally cannot sign in, role is a fixed property of a *user*, and there
is no way to attach a curator to someone else's collection. This redesign makes
the app self-serve:

> "When I sign in for the first time, I should choose an existing collection or
> create a new collection. In the new collection, I should be able to choose
> between the curator and operator roles. If I choose operator, then I should
> have the option to add a curator." — Kimberly, 2026-05-14

## Why This Is a Schema Change, Not a Bug Fix

Three hard blockers in the current code, all structural:

1. **Self-signup is disabled.** `lib/auth-adapter.ts` `createUser()` throws;
   `auth.ts` `signIn` returns `!!dbUser`, so sign-in fails unless a `User` row
   already exists. There is no path that creates that row.
2. **Role is global per-user.** `prisma/schema.prisma` — `User.role` is a
   required `Role` enum set at row creation. A person is "an operator" or "a
   curator" everywhere, forever. The expected behaviour is "operator *of this
   collection*, curator *of that one*."
3. **Curators are never linked to collections.** `Collection` has one `ownerId`
   and nothing else. "Add a curator" has no table, no action, no UI. Even the
   current curator home (`app/(curator)/page.tsx`) lists `getUserCollections()`
   — collections you *own* — so a "curator" today can only ever see their own
   collections, never the operator's.

The data model cannot express the target behaviour. We need new tables and a
migration.

---

## Recommended Design

### Data model

**New — `CollectionMembership`** (the authorization source of truth):

```prisma
model CollectionMembership {
  id           Int        @id @default(autoincrement())
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionId Int
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       Int
  role         Role       // operator | curator — scoped to THIS collection
  createdAt    DateTime   @default(now())

  @@unique([collectionId, userId])
}
```

**New — `CollectionInvite`** (a pending "add a curator", claimed on sign-in):

```prisma
model CollectionInvite {
  id           Int        @id @default(autoincrement())
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionId Int
  email        String     // invited email — may not have an account yet
  role         Role       @default(curator)
  invitedById  Int
  invitedBy    User       @relation("InvitesSent", fields: [invitedById], references: [id])
  createdAt    DateTime   @default(now())
  acceptedAt   DateTime?

  @@unique([collectionId, email])
}
```

**Changed — `User`:**
- **Drop `role`.** Role is per-collection now; a global column is dead weight
  and an obstacle to self-signup (a required enum with nothing to populate it
  at `createUser` time).
- `name String` → `name String @default("")`. The email provider gives us an
  email and usually no name; a default keeps the column non-null without
  forcing an onboarding "what's your name" step (YAGNI).
- Add relations: `memberships CollectionMembership[]`, `invitesSent CollectionInvite[] @relation("InvitesSent")`.

**Changed — `Collection`:**
- **Keep `ownerId`** as "who created this row" — FK integrity, cheap audit, and
  it keeps the migration small. Authorization no longer reads `ownerId`; it
  reads `CollectionMembership`. The creator always also gets a membership row,
  so the two coexist.
- Add relations: `memberships CollectionMembership[]`, `invites CollectionInvite[]`.

`Role` enum is unchanged (`operator | curator`).

### Migration (`prisma/migrations/<ts>_per_collection_roles/migration.sql`)

Hand-authored SQL, matching the three existing migrations (the repo has no
`migration_lock.toml` and `build` does not run `migrate deploy`, so migrations
are applied out-of-band — see Open Question 4). Order is load-bearing — backfill
**before** dropping `User.role`:

1. `CREATE TABLE "CollectionMembership"` + `@@unique` index.
2. `CREATE TABLE "CollectionInvite"` + `@@unique` index.
3. Backfill memberships from existing data:
   ```sql
   INSERT INTO "CollectionMembership" ("collectionId", "userId", "role", "createdAt")
   SELECT c."id", c."ownerId", u."role", c."createdAt"
   FROM "Collection" c JOIN "User" u ON u."id" = c."ownerId";
   ```
4. `ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT '';`
5. `ALTER TABLE "User" DROP COLUMN "role";`

**Demo data survives:** the demo `User` (`demo-owner@purseinator.local`,
previously `role: operator`) and the `isDemo` collection are untouched; step 3
gives the demo user an `operator` membership on the demo collection. The demo
viewing flow is anonymous + host-based (`lib/demo-server.ts`) and never reads
membership, so it is unaffected regardless.

### Self-signup

- `lib/auth-adapter.ts` `createUser(user)` → actually insert:
  `db.user.create({ data: { email: user.email!, name: user.name ?? '' } })`,
  return `toAdapterUser`. (No `role` to set — that is the point.)
- `auth.ts` `signIn` callback → `return !!user.email` (the Resend provider has
  already verified the email via the magic link before this runs; the adapter
  creates the row if `getUserByEmail` returned null).
- `auth.ts` `jwt`/`session` callbacks → stop copying `role`. The token carries
  `id` only. Role is resolved per-collection, server-side, at access time.

This file overlaps **purses-0zq** (magic-link session). Phase 4 rebases onto
purses-0zq's merged `auth.ts` and re-applies these callback edits on top.

### "Add a curator"

One server action, one code path:

`addCuratorByEmail(collectionId, email)`:
1. Assert the caller has an `operator` membership on `collectionId`.
2. Upsert `CollectionInvite(collectionId, email, role: curator, invitedById: caller)`.
3. If a `User` with that email already exists → create the
   `CollectionMembership` immediately and set `acceptedAt` now (claimed on the spot).
4. Otherwise the invite stays pending.

On sign-in, a `claimInvites(userId, email)` helper (called from the `signIn`
callback, where the user row is guaranteed to exist) converts every pending
`CollectionInvite` for that email into a `CollectionMembership` and stamps
`acceptedAt`. So an operator can add a curator who has no account yet; the
curator just signs in normally and the invite auto-claims.

**v1 sends no separate notification email** — the operator tells the curator
out-of-band. Resend is currently wired only through NextAuth's provider; a
templated invite email is a clean follow-up but not required by the acceptance
criteria. (See Open Question 2.)

### First-run / onboarding flow

`app/(curator)/page.tsx` (the `/` route) becomes the post-auth router:

- **Demo host** → unchanged (redirect into the demo collection).
- **No session** → `/login` (unchanged).
- **Session, 0 memberships** → **onboarding screen**:
  - If pending `CollectionInvite`s exist for the user's email → list them
    ("Join *Spring 2026* as curator") with an accept button, **plus** a
    "create your own collection" option.
  - If no invites → "Create your first collection" (the "choose existing"
    branch simply has nothing to show — see Open Question 1).
- **Session, ≥1 membership** → the **collection picker**: every collection the
  user is a member of, each card badged with the user's role there. Operator
  cards link to the operator views (`/collections/[id]`); curator cards link to
  the curator views (`/[id]`).

This replaces the current `role === 'operator' → redirect('/dashboard')` jump
and the `getUserCollections()` (owner-only) listing.

### Creating a collection — pick your role

`app/(operator)/collections/new/page.tsx` gains a role choice (operator /
curator). `createCollection(name, description, role)`:
1. Create the `Collection` with `ownerId = caller`.
2. Create a `CollectionMembership(collection, caller, role)` with the chosen role.
3. If `role === operator` → the post-create screen offers "Add a curator"
   (the `addCuratorByEmail` flow above).

A collection created by someone who picks `curator` has an owner row but no
operator membership — an intentionally allowed state (it is exactly what the
quote asks for). See Open Question 3.

### Authorization model change

With `role` gone from the JWT, `proxy.ts` can no longer do role gating. It drops
to **auth-only** gating (authenticated vs not, plus the existing demo handling).
Per-collection authorization moves entirely server-side into a shared helper:

```ts
// lib/authz.ts
assertCollectionRole(collectionId, userId, role: 'operator' | 'curator' | 'any')
```

— used by pages and server actions. This generalizes the `assertCollectionOwner`
helper that **purses-90i** is adding to `actions/ranking.ts` / items / photos.
Phase 4 rebases onto purses-90i's merged ownership checks and swaps
`assertCollectionOwner` (owner-id based) for `assertCollectionRole` (membership
based). The bead notes confirm this is the intended hand-off: purses-90i "keeps
operator-gating for now," purses-72e owns the replacement.

---

## Approaches Considered

### Role model

**A. Supplement** — add `CollectionMembership`, keep `User.role`.
Smallest migration, least blast radius during transition. Rejected: two sources
of truth for "role," a required `User.role` column with no real meaning, and
self-signup still blocked by that required column.

**B. Replace (RECOMMENDED)** — `CollectionMembership` is the only role; drop
`User.role`. Single source of truth, true per-collection roles, self-signup
falls out for free. Larger blast radius (`auth.ts`, `proxy.ts`, `e2e/fixtures.ts`,
`(curator)/page.tsx`) — but the bead explicitly sequences Phase 4 after the
sibling beads merge, which is exactly to absorb this.

**C. No join table** — encode role on `Collection` (JSON column / extra FKs).
Rejected: cannot express "one user, curator on N collections," breaks
normalization.

### Invites

**A. Separate `CollectionInvite` table, claimed on sign-in (RECOMMENDED)** —
clean boundary, one code path whether or not the invitee has an account.

**B. Nullable-`userId` rows in `CollectionMembership`** — rejected: complicates
the `@@unique` constraint and every membership query with "is this real or
pending."

**C. Tokenized invite emails (like magic links)** — more scope; deferred. v1
relies on auto-claim by matching email.

---

## Open Questions for Kimberly

These are genuine product decisions — please answer in your approval reply.

1. **"Choose an existing collection" for a brand-new user with no invites.**
   A first-time user with zero pending invites has no "existing" collections to
   choose — the onboarding screen would only offer "create new." Is that fine,
   or do you want a join-by-code / shared-link mechanism so someone can join a
   collection they weren't explicitly invited to? *(Recommendation: invites
   only, no global directory — privacy. The "choose existing" path is mainly
   for returning users and invited curators.)*

2. **Invite notification email.** When an operator adds a curator by email,
   should the app send them an email ("you've been added to ..."), or is
   out-of-band ("go sign in at ...") fine for v1? *(Recommendation: no email in
   v1; add a templated Resend invite email as a fast follow.)*

3. **Creating a collection as "curator."** When *you* create a collection and
   pick the curator role for yourself, the collection has an owner but no
   operator. Is that the intended meaning (you just want to rank your own
   stuff), or should the creator always be operator and "curator" only ever
   applies to people you invite? *(Recommendation: honor the literal request —
   creator may pick either; a curator-created collection simply has no operator
   until one is added.)*

4. **How do migrations reach production?** The repo has three hand-written SQL
   migrations, no `migration_lock.toml`, and `npm run build` does not run
   `prisma migrate deploy`. Confirm migrations are applied manually against
   Neon so Phase 4 documents the right deploy step. *(Recommendation/assumption:
   hand-applied, matching the existing three.)*

---

## Acceptance Criteria Coverage

| Bead criterion | Where addressed |
|---|---|
| Design explored (options + recommendation) | This document |
| Implementation plan written | `docs/plans/2026-05-14-onboarding-flow.md` |
| Design + plan sent to Kimberly, approved before implementation | Phase 3 checkpoint — mail sent, **waiting** |
| New user signs in → choose-existing-OR-create-new | Self-signup + onboarding router (`/`) |
| Creating a collection lets creator pick curator/operator | `createCollection(…, role)` + new-collection form |
| Operator can add a curator | `addCuratorByEmail` + `CollectionInvite` + claim-on-sign-in |
| Schema migration written + tested, demo data survives | `per_collection_roles` migration + backfill; demo user/collection untouched |
| All work TDD | Phase 4 plan is failing-test-first throughout |
| Suite green + tsc + lint + Vercel build green | Phase 4 final tasks |

## Risks / Coordination

- **purses-90i** (upload + ownership checks) and **purses-0zq** (magic-link
  session) both touch files this redesign touches (`auth.ts`, `proxy.ts`,
  `actions/*`). Per the bead, Phase 4 implementation **rebases onto their merged
  changes** — it does not race them.
- `e2e/fixtures.ts` forges a JWT with a `role` field. Removing `role` from the
  token breaks role-based e2e routing; Phase 4 reworks the fixtures to seed
  `CollectionMembership` rows instead. Tracked as an explicit plan task.
