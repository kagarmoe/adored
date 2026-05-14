# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable self-signup and a per-collection role model so a new user can sign in, choose an existing collection or create a new one, pick operator/curator on creation, and (as operator) add a curator.

**Architecture:** Add `CollectionMembership` (per-collection role, the authz source of truth) and `CollectionInvite` (pending add-a-curator, claimed on sign-in). Drop the global `User.role`. `proxy.ts` drops to auth-only gating; per-collection authorization moves into a server-side `assertCollectionRole` helper used by pages and actions. The `/` route becomes the post-auth router (onboarding vs collection picker).

**Tech Stack:** Next.js App Router · TypeScript · Prisma 7 · PostgreSQL (Neon) · Auth.js v5 + Resend · Vitest · Playwright

---

## Status & Prerequisites

**This plan is Phase 4 of bead purses-72e and is gated:**

1. **Awaiting Kimberly's approval** of this plan + the design doc
   (`docs/plans/2026-05-14-onboarding-flow-design.md`). The four Open Questions
   in the design doc may change Tasks 9–12. Do not start until approved.
2. **Rebase first.** Phase 4 rebases onto the merged work of the sibling beads
   before starting:
   - **purses-90i** — adds `assertCollectionOwner` ownership checks to
     `actions/items.ts`, `actions/photos.ts`, and the operator collection/upload
     pages, and makes `/collections/*` operator-gating non-silent.
   - **purses-0zq** — fixes magic-link session persistence; touches `auth.ts`.
   ```bash
   git fetch origin main
   git rebase origin/main
   ```
   If either sibling renamed/moved the files below, re-target the edits.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `prisma/schema.prisma` | Data model | Modify — add 2 models, drop `User.role`, add relations |
| `prisma/migrations/<ts>_per_collection_roles/migration.sql` | DDL + backfill | Create |
| `lib/auth-adapter.ts` | NextAuth adapter | Modify — `createUser` inserts |
| `lib/auth-callbacks.ts` | Extracted, unit-testable NextAuth callbacks | Create |
| `auth.ts` | NextAuth config | Modify — use extracted callbacks |
| `lib/authz.ts` | `assertCollectionRole` — per-collection authz | Create |
| `lib/invites.ts` | `claimInvites` helper | Create |
| `actions/collections.ts` | Collection + membership server actions | Modify |
| `actions/curators.ts` | `addCuratorByEmail` server action | Create |
| `components/onboarding/OnboardingScreen.tsx` | First-run UI | Create |
| `components/onboarding/CollectionPicker.tsx` | Role-badged collection list | Create |
| `components/operator/AddCuratorForm.tsx` | Add-a-curator UI | Create |
| `app/(curator)/page.tsx` | Post-auth router | Modify |
| `app/(operator)/collections/new/page.tsx` | New-collection form + role picker | Modify |
| `proxy.ts` | Middleware | Modify — drop role gating |
| `e2e/fixtures.ts` | Playwright auth fixtures | Modify — seed memberships |
| `prisma/seed-demo.ts` | Demo seed | Modify — add demo operator membership |

Test files mirror these under `lib/__tests__/`, `components/__tests__/`,
`actions` tests under `lib/__tests__/actions/`.

---

## Batch 1: Schema + Migration

### Task 1: Schema models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_per_collection_roles/migration.sql`

Schema DDL cannot be unit-tested directly; its *effects* are covered by every
later task's tests. This task is verified by codegen + a scratch-DB apply.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In `model User` — remove the `role Role` line, change `name`, add relations:
```prisma
model User {
  id          Int                    @id @default(autoincrement())
  email       String                 @unique
  name        String                 @default("")
  createdAt   DateTime               @default(now())
  collections Collection[]
  sessions    Session[]
  accounts    Account[]
  memberships CollectionMembership[]
  invitesSent CollectionInvite[]     @relation("InvitesSent")
}
```

In `model Collection` — add relations:
```prisma
  memberships CollectionMembership[]
  invites     CollectionInvite[]
```

Add two new models above `enum Role`:
```prisma
model CollectionMembership {
  id           Int        @id @default(autoincrement())
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionId Int
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       Int
  role         Role
  createdAt    DateTime   @default(now())

  @@unique([collectionId, userId])
}

model CollectionInvite {
  id           Int        @id @default(autoincrement())
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionId Int
  email        String
  role         Role       @default(curator)
  invitedById  Int
  invitedBy    User       @relation("InvitesSent", fields: [invitedById], references: [id])
  createdAt    DateTime   @default(now())
  acceptedAt   DateTime?

  @@unique([collectionId, email])
}
```

- [ ] **Step 2: Create the migration SQL**

`prisma/migrations/<ts>_per_collection_roles/migration.sql` (`<ts>` = current
UTC `YYYYMMDDHHMMSS`, matching the existing migration naming):
```sql
-- CreateTable
CREATE TABLE "CollectionMembership" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionInvite" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'curator',
    "invitedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "CollectionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionMembership_collectionId_userId_key" ON "CollectionMembership"("collectionId", "userId");
CREATE UNIQUE INDEX "CollectionInvite_collectionId_email_key" ON "CollectionInvite"("collectionId", "email");

-- AddForeignKey
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionMembership" ADD CONSTRAINT "CollectionMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionInvite" ADD CONSTRAINT "CollectionInvite_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionInvite" ADD CONSTRAINT "CollectionInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill memberships from existing owner+role BEFORE dropping User.role
INSERT INTO "CollectionMembership" ("collectionId", "userId", "role", "createdAt")
SELECT c."id", c."ownerId", u."role", c."createdAt"
FROM "Collection" c JOIN "User" u ON u."id" = c."ownerId";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "User" DROP COLUMN "role";
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: regenerates `lib/generated/prisma` with no errors; new model types
`CollectionMembership` / `CollectionInvite` available, `User.role` gone.

- [ ] **Step 4: Verify against a scratch DB (demo-data survival)**

Run (against a disposable local Postgres, NOT prod):
```bash
# 1. Apply only the pre-existing migrations, seed demo, snapshot
npx prisma migrate deploy   # or apply the 3 existing SQL files
ALLOW_DEMO_SEED=1 npx tsx prisma/seed-demo.ts
# 2. Apply the new migration
psql "$DATABASE_URL" -f prisma/migrations/<ts>_per_collection_roles/migration.sql
# 3. Assert the demo user + collection + a backfilled operator membership exist
psql "$DATABASE_URL" -c "SELECT m.role FROM \"CollectionMembership\" m
  JOIN \"Collection\" c ON c.id = m.\"collectionId\"
  JOIN \"User\" u ON u.id = m.\"userId\"
  WHERE c.\"isDemo\" = true AND u.email = 'demo-owner@purseinator.local';"
```
Expected: one row, `role = operator`.

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: per-collection role schema — membership + invite tables (purses-72e)"
```

### Task 2: Demo seed grants an operator membership

The seed must be idempotent and self-contained so fresh dev/CI DBs (which run
the migration with *no* prior data, so the backfill inserts nothing) still get
a demo operator membership.

**Files:**
- Modify: `prisma/seed-demo.ts`
- Modify: `prisma/__tests__/seed-demo.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `prisma/__tests__/seed-demo.test.ts` — extract the membership upsert into
a testable `ensureDemoMembership(db, collectionId, userId)` helper:
```ts
describe('ensureDemoMembership', () => {
  it('creates an operator membership when none exists', async () => {
    const db = {
      collectionMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    }
    await ensureDemoMembership(db as never, 10, 20)
    expect(db.collectionMembership.create).toHaveBeenCalledWith({
      data: { collectionId: 10, userId: 20, role: 'operator' },
    })
  })

  it('is idempotent — skips when the membership already exists', async () => {
    const db = {
      collectionMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
        create: vi.fn(),
      },
    }
    await ensureDemoMembership(db as never, 10, 20)
    expect(db.collectionMembership.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run prisma/__tests__/seed-demo.test.ts`
Expected: FAIL — `ensureDemoMembership is not exported`.

- [ ] **Step 3: Implement**

In `prisma/seed-demo.ts`, add the helper and extend `SeedDb`:
```ts
export async function ensureDemoMembership(
  db: { collectionMembership: {
    findUnique: (a: { where: { collectionId_userId: { collectionId: number; userId: number } } }) => Promise<unknown | null>
    create: (a: { data: { collectionId: number; userId: number; role: 'operator' } }) => Promise<unknown>
  } },
  collectionId: number,
  userId: number,
): Promise<void> {
  const existing = await db.collectionMembership.findUnique({
    where: { collectionId_userId: { collectionId, userId } },
  })
  if (!existing) {
    await db.collectionMembership.create({
      data: { collectionId, userId, role: 'operator' },
    })
  }
}
```
Call it from `main()` after the collection upsert:
`await ensureDemoMembership(db, collection.id, owner.id)`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run prisma/__tests__/seed-demo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add prisma/seed-demo.ts prisma/__tests__/seed-demo.test.ts
git commit -m "feat: demo seed grants operator membership on demo collection (purses-72e)"
```

---

## Batch 2: Self-signup

### Task 3: Adapter `createUser` inserts a row

**Files:**
- Modify: `lib/auth-adapter.ts`
- Modify: `lib/__tests__/auth-adapter.test.ts`

- [ ] **Step 1: Replace the failing-state test with the new behavior**

In `lib/__tests__/auth-adapter.test.ts`, add `create: vi.fn()` to `mockDb.user`,
and replace the `createUser` describe block:
```ts
describe('createUser', () => {
  it('creates a user row from email + name and returns the adapter user', async () => {
    mockDb.user.create.mockResolvedValue({ id: 5, email: 'new@example.com', name: 'New' })
    const result = await adapter.createUser!({
      id: '', email: 'new@example.com', name: 'New', emailVerified: null,
    })
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: { email: 'new@example.com', name: 'New' },
    })
    expect(result).toEqual({
      id: '5', email: 'new@example.com', name: 'New', emailVerified: null, image: null,
    })
  })

  it('defaults name to empty string when none is supplied', async () => {
    mockDb.user.create.mockResolvedValue({ id: 6, email: 'x@y.com', name: '' })
    await adapter.createUser!({ id: '', email: 'x@y.com', emailVerified: null } as never)
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: { email: 'x@y.com', name: '' },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/auth-adapter.test.ts`
Expected: FAIL — `createUser` throws instead of creating.

- [ ] **Step 3: Implement**

In `lib/auth-adapter.ts`, replace `createUser`:
```ts
async createUser(user) {
  const created = await db.user.create({
    data: { email: user.email, name: user.name ?? '' },
  })
  return toAdapterUser(created)
},
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/auth-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/auth-adapter.ts lib/__tests__/auth-adapter.test.ts
git commit -m "feat: enable self-signup — adapter createUser inserts a user row (purses-72e)"
```

### Task 4: Extract + retarget NextAuth callbacks

The `signIn`/`jwt`/`session` callbacks are currently inline in `auth.ts` and
untestable. Extract them, drop `role`, and have `signIn` allow any verified
email + claim pending invites.

**Files:**
- Create: `lib/auth-callbacks.ts`
- Create: `lib/__tests__/auth-callbacks.test.ts`
- Modify: `auth.ts`

> **Rebase note:** purses-0zq edits `auth.ts`. Apply this extraction on top of
> their merged version — keep any session/cookie config they added.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/auth-callbacks.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}))
const mockClaimInvites = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/invites', () => ({ claimInvites: mockClaimInvites }))

import { signInCallback, jwtCallback, sessionCallback } from '@/lib/auth-callbacks'

describe('signInCallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows sign-in for any verified email and claims pending invites', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 7, email: 'a@b.com' })
    const ok = await signInCallback({ user: { email: 'a@b.com' } } as never)
    expect(ok).toBe(true)
    expect(mockClaimInvites).toHaveBeenCalledWith(7, 'a@b.com')
  })

  it('rejects sign-in when there is no email', async () => {
    expect(await signInCallback({ user: {} } as never)).toBe(false)
  })
})

describe('jwtCallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('puts the db user id on the token and never a role', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 9, email: 'c@d.com' })
    const token = await jwtCallback({ token: {}, user: { email: 'c@d.com' } } as never)
    expect(token.id).toBe('9')
    expect('role' in token).toBe(false)
  })
})

describe('sessionCallback', () => {
  it('copies id onto session.user and never a role', async () => {
    const session = await sessionCallback({
      session: { user: {} }, token: { id: '9' },
    } as never)
    expect(session.user.id).toBe('9')
    expect('role' in session.user).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/auth-callbacks.test.ts`
Expected: FAIL — `lib/auth-callbacks` does not exist.

- [ ] **Step 3: Implement `lib/auth-callbacks.ts`**

```ts
import { db } from './db'
import { claimInvites } from './invites'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

export async function signInCallback({ user }: { user: { email?: string | null } }) {
  if (!user.email) return false
  const dbUser = await db.user.findUnique({ where: { email: user.email } })
  // The adapter has created the row by now; claim any invites for this email.
  if (dbUser) await claimInvites(dbUser.id, dbUser.email)
  return true
}

export async function jwtCallback({ token, user }: { token: JWT; user?: { email?: string | null } }) {
  if (user?.email) {
    const dbUser = await db.user.findUnique({ where: { email: user.email } })
    if (dbUser) token.id = String(dbUser.id)
  }
  return token
}

export async function sessionCallback({ session, token }: { session: Session; token: JWT }) {
  if (token.id) session.user.id = token.id as string
  return session
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/auth-callbacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `auth.ts`**

Replace the inline `callbacks` object with the imports:
```ts
import { signInCallback, jwtCallback, sessionCallback } from './lib/auth-callbacks'
// ...
  callbacks: {
    signIn: signInCallback,
    jwt: jwtCallback,
    session: sessionCallback,
  },
```

- [ ] **Step 6: Commit**
```bash
git add auth.ts lib/auth-callbacks.ts lib/__tests__/auth-callbacks.test.ts
git commit -m "refactor: extract NextAuth callbacks, drop global role from token (purses-72e)"
```

---

## Batch 3: Authorization, invites, and collection actions

### Task 5: `assertCollectionRole` authz helper

**Files:**
- Create: `lib/authz.ts`
- Create: `lib/__tests__/authz.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/authz.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  collectionMembership: { findUnique: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { assertCollectionRole } from '@/lib/authz'

describe('assertCollectionRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes when the user has the exact role', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    await expect(assertCollectionRole(1, '2', 'operator')).resolves.toBeUndefined()
  })

  it("passes for role 'any' when the user is a member with any role", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    await expect(assertCollectionRole(1, '2', 'any')).resolves.toBeUndefined()
  })

  it('throws Unauthorized when the user is not a member', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue(null)
    await expect(assertCollectionRole(1, '2', 'any')).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when the member has the wrong role', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    await expect(assertCollectionRole(1, '2', 'operator')).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/authz.test.ts`
Expected: FAIL — `lib/authz` does not exist.

- [ ] **Step 3: Implement `lib/authz.ts`**

```ts
import { db } from './db'

export type RequiredRole = 'operator' | 'curator' | 'any'

/** Throws `Error('Unauthorized')` unless the user has the required membership role. */
export async function assertCollectionRole(
  collectionId: number,
  userId: string,
  required: RequiredRole,
): Promise<void> {
  const membership = await db.collectionMembership.findUnique({
    where: { collectionId_userId: { collectionId, userId: Number(userId) } },
  })
  if (!membership) throw new Error('Unauthorized')
  if (required !== 'any' && membership.role !== required) {
    throw new Error('Unauthorized')
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/authz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/authz.ts lib/__tests__/authz.test.ts
git commit -m "feat: assertCollectionRole — per-collection authorization helper (purses-72e)"
```

### Task 6: `claimInvites` helper

**Files:**
- Create: `lib/invites.ts`
- Create: `lib/__tests__/invites.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/invites.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  collectionInvite: { findMany: vi.fn(), update: vi.fn() },
  collectionMembership: { upsert: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { claimInvites } from '@/lib/invites'

describe('claimInvites', () => {
  beforeEach(() => vi.clearAllMocks())

  it('converts each pending invite into a membership and stamps acceptedAt', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([
      { id: 1, collectionId: 10, email: 'a@b.com', role: 'curator' },
    ])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionMembership.upsert).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 10, userId: 7 } },
      create: { collectionId: 10, userId: 7, role: 'curator' },
      update: {},
    })
    expect(mockDb.collectionInvite.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { acceptedAt: expect.any(Date) },
    })
  })

  it('does nothing when there are no pending invites', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionMembership.upsert).not.toHaveBeenCalled()
  })

  it('only looks at unaccepted invites for that email', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionInvite.findMany).toHaveBeenCalledWith({
      where: { email: 'a@b.com', acceptedAt: null },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/invites.test.ts`
Expected: FAIL — `lib/invites` does not exist.

- [ ] **Step 3: Implement `lib/invites.ts`**

```ts
import { db } from './db'

/**
 * Converts every pending invite for `email` into a CollectionMembership and
 * stamps the invite accepted. Idempotent: membership upsert + acceptedAt guard
 * make a repeat call a no-op. Called from the signIn callback.
 */
export async function claimInvites(userId: number, email: string): Promise<void> {
  const pending = await db.collectionInvite.findMany({
    where: { email, acceptedAt: null },
  })
  for (const invite of pending) {
    await db.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId: invite.collectionId, userId } },
      create: { collectionId: invite.collectionId, userId, role: invite.role },
      update: {},
    })
    await db.collectionInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/invites.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/invites.ts lib/__tests__/invites.test.ts
git commit -m "feat: claimInvites — auto-convert pending invites on sign-in (purses-72e)"
```

### Task 7: `createCollection` takes a role + creates a membership

**Files:**
- Modify: `actions/collections.ts`
- Modify: `lib/__tests__/actions/collections.test.ts`

- [ ] **Step 1: Write the failing test**

In `lib/__tests__/actions/collections.test.ts`, add `collectionMembership: { create: vi.fn() }`
to `mockDb`, and update the `createCollection` block:
```ts
it('creates the collection then a membership with the chosen role', async () => {
  mockDb.collection.create.mockResolvedValue({ id: 3, name: 'Summer' })
  await createCollection('Summer', '', 'curator')
  expect(mockDb.collection.create).toHaveBeenCalledWith({
    data: { name: 'Summer', description: '', owner: { connect: { id: 1 } } },
  })
  expect(mockDb.collectionMembership.create).toHaveBeenCalledWith({
    data: { collectionId: 3, userId: 1, role: 'curator' },
  })
})

it('defaults the creator role to operator', async () => {
  mockDb.collection.create.mockResolvedValue({ id: 4 })
  await createCollection('X')
  expect(mockDb.collectionMembership.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ role: 'operator' }) }),
  )
})
```
Also update `getUserCollections` tests — see Task 8; if you reorder, keep them
green at each commit.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/actions/collections.test.ts`
Expected: FAIL — `createCollection` ignores the role arg, never creates a membership.

- [ ] **Step 3: Implement**

In `actions/collections.ts`, update `createCollection`:
```ts
import type { Role } from '@/lib/generated/prisma/client'

export async function createCollection(
  name: string,
  description = '',
  role: Role = 'operator',
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = parseInt(session.user.id)

  const collection = await db.collection.create({
    data: { name, description, owner: { connect: { id: userId } } },
  })
  await db.collectionMembership.create({
    data: { collectionId: collection.id, userId, role },
  })

  revalidatePath('/')
  return collection
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/actions/collections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add actions/collections.ts lib/__tests__/actions/collections.test.ts
git commit -m "feat: createCollection records creator membership with chosen role (purses-72e)"
```

### Task 8: Membership-based collection queries

`getUserCollections` (owner-only) and `getCollection` (owner-filtered) must
become membership-based so curators see collections they were invited to.

**Files:**
- Modify: `actions/collections.ts`
- Modify: `lib/__tests__/actions/collections.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the `getUserCollections` describe block:
```ts
describe('getUserMemberships', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue(session) })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getUserMemberships()).rejects.toThrow('Unauthorized')
  })

  it('returns memberships for the current user with collection + role', async () => {
    const memberships = [{ role: 'curator', collection: { id: 1, name: 'A', items: [] } }]
    mockDb.collectionMembership.findMany.mockResolvedValue(memberships)
    const result = await getUserMemberships()
    expect(result).toEqual(memberships)
    expect(mockDb.collectionMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 } }),
    )
  })
})
```
And update `getCollection` tests so the membership check (not `ownerId`) gates
access:
```ts
it('returns null when the user has no membership on the collection', async () => {
  mockDb.collectionMembership.findUnique.mockResolvedValue(null)
  expect(await getCollection(1)).toBeNull()
  expect(mockDb.collection.findFirst).not.toHaveBeenCalled()
})

it('returns the collection when the user is a member', async () => {
  mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
  mockDb.collection.findFirst.mockResolvedValue({ id: 1, items: [] })
  expect(await getCollection(1)).toEqual({ id: 1, items: [] })
})
```
Add `collectionMembership: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }`
to `mockDb`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/actions/collections.test.ts`
Expected: FAIL — `getUserMemberships` not exported; `getCollection` still filters by `ownerId`.

- [ ] **Step 3: Implement**

In `actions/collections.ts`:
```ts
export async function getUserMemberships() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  return db.collectionMembership.findMany({
    where: { userId: parseInt(session.user.id) },
    include: { collection: { include: { items: { select: { id: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCollection(id: number) {
  const session = await auth()
  if (!session?.user?.id) return null

  const membership = await db.collectionMembership.findUnique({
    where: { collectionId_userId: { collectionId: id, userId: parseInt(session.user.id) } },
  })
  if (!membership) return null

  return db.collection.findFirst({
    where: { id },
    include: {
      items: {
        include: {
          photos: { where: { isHero: true }, take: 1 },
          wins: true,
          comparisonsAsA: true,
          comparisonsAsB: true,
        },
      },
    },
  })
}
```
Delete the now-unused `getUserCollections` (grep for callers first — `app/(curator)/page.tsx`
is rewritten in Task 11; update any others).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/actions/collections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add actions/collections.ts lib/__tests__/actions/collections.test.ts
git commit -m "feat: membership-based collection queries (getUserMemberships) (purses-72e)"
```

### Task 9: `addCuratorByEmail` server action

**Files:**
- Create: `actions/curators.ts`
- Create: `lib/__tests__/actions/curators.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/actions/curators.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockAssertRole = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  collectionInvite: { upsert: vi.fn() },
  collectionMembership: { upsert: vi.fn() },
}))
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/authz', () => ({ assertCollectionRole: mockAssertRole }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addCuratorByEmail } from '@/actions/curators'

describe('addCuratorByEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: '1' } })
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(addCuratorByEmail(5, 'c@d.com')).rejects.toThrow('Unauthorized')
  })

  it('requires the caller to be an operator of the collection', async () => {
    mockAssertRole.mockRejectedValue(new Error('Unauthorized'))
    await expect(addCuratorByEmail(5, 'c@d.com')).rejects.toThrow('Unauthorized')
    expect(mockAssertRole).toHaveBeenCalledWith(5, '1', 'operator')
  })

  it('records a pending invite when the invitee has no account', async () => {
    mockAssertRole.mockResolvedValue(undefined)
    mockDb.user.findUnique.mockResolvedValue(null)
    await addCuratorByEmail(5, 'newcurator@d.com')
    expect(mockDb.collectionInvite.upsert).toHaveBeenCalledWith({
      where: { collectionId_email: { collectionId: 5, email: 'newcurator@d.com' } },
      create: { collectionId: 5, email: 'newcurator@d.com', role: 'curator', invitedById: 1 },
      update: {},
    })
    expect(mockDb.collectionMembership.upsert).not.toHaveBeenCalled()
  })

  it('claims immediately when the invitee already has an account', async () => {
    mockAssertRole.mockResolvedValue(undefined)
    mockDb.user.findUnique.mockResolvedValue({ id: 42, email: 'existing@d.com' })
    await addCuratorByEmail(5, 'existing@d.com')
    expect(mockDb.collectionMembership.upsert).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 5, userId: 42 } },
      create: { collectionId: 5, userId: 42, role: 'curator' },
      update: {},
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/actions/curators.test.ts`
Expected: FAIL — `actions/curators` does not exist.

- [ ] **Step 3: Implement `actions/curators.ts`**

```ts
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { assertCollectionRole } from '@/lib/authz'
import { revalidatePath } from 'next/cache'

/**
 * Operator adds a curator to a collection by email. If the email already has an
 * account, the membership is created immediately; otherwise a pending invite is
 * recorded and claimed when that email next signs in (see lib/invites.ts).
 */
export async function addCuratorByEmail(collectionId: number, email: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  await assertCollectionRole(collectionId, session.user.id, 'operator')

  const normalized = email.trim().toLowerCase()

  await db.collectionInvite.upsert({
    where: { collectionId_email: { collectionId, email: normalized } },
    create: {
      collectionId,
      email: normalized,
      role: 'curator',
      invitedById: parseInt(session.user.id),
    },
    update: {},
  })

  const existing = await db.user.findUnique({ where: { email: normalized } })
  if (existing) {
    await db.collectionMembership.upsert({
      where: { collectionId_userId: { collectionId, userId: existing.id } },
      create: { collectionId, userId: existing.id, role: 'curator' },
      update: {},
    })
    await db.collectionInvite.update({
      where: { collectionId_email: { collectionId, email: normalized } },
      data: { acceptedAt: new Date() },
    })
  }

  revalidatePath(`/collections/${collectionId}`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/actions/curators.test.ts`
Expected: PASS. (If the `collectionInvite.update` call needs mocking, add
`update: vi.fn()` to the `collectionInvite` mock — adjust the test accordingly.)

- [ ] **Step 5: Commit**
```bash
git add actions/curators.ts lib/__tests__/actions/curators.test.ts
git commit -m "feat: addCuratorByEmail — operator invites a curator (purses-72e)"
```

---

## Batch 4: Onboarding UI

> Tasks 10–13 depend on Kimberly's answers to Open Questions 1–3 in the design
> doc. The component contracts below assume the recommended answers; adjust copy
> and the "choose existing" branch if she redirects.

### Task 10: `OnboardingScreen` component

**Files:**
- Create: `components/onboarding/OnboardingScreen.tsx`
- Create: `components/__tests__/onboarding/OnboardingScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`components/__tests__/onboarding/OnboardingScreen.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'

describe('OnboardingScreen', () => {
  it('always offers creating a new collection', () => {
    render(<OnboardingScreen invites={[]} />)
    expect(screen.getByRole('link', { name: /create.*collection/i })).toHaveAttribute(
      'href', '/collections/new',
    )
  })

  it('lists pending invites with a join action', () => {
    render(<OnboardingScreen invites={[{ collectionId: 7, collectionName: 'Spring 2026', role: 'curator' }]} />)
    expect(screen.getByText(/spring 2026/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /join/i })).toBeVisible()
  })

  it('shows no invite list when there are none', () => {
    render(<OnboardingScreen invites={[]} />)
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/__tests__/onboarding/OnboardingScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement**

`components/onboarding/OnboardingScreen.tsx` — a client component. Invites are
already auto-claimed on sign-in (Task 6), so the "Join" button just navigates
into the collection; render it as a `Link` to `/[collectionId]` (curator view).
Match the visual language of `app/(operator)/collections/new/page.tsx` (font-display
headings, `bg-accent` buttons). Props:
```ts
type InviteVM = { collectionId: number; collectionName: string; role: 'operator' | 'curator' }
export function OnboardingScreen({ invites }: { invites: InviteVM[] }) { /* ... */ }
```
Headline "Welcome to PurseInator"; if `invites.length`, a "You've been invited"
section with one row per invite (name + role + a Join `Link`); always a
"Create a new collection" `Link` to `/collections/new`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/__tests__/onboarding/OnboardingScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/onboarding/OnboardingScreen.tsx components/__tests__/onboarding/OnboardingScreen.test.tsx
git commit -m "feat: OnboardingScreen — first-run choose-existing-or-create UI (purses-72e)"
```

### Task 11: `CollectionPicker` + `/` router page

**Files:**
- Create: `components/onboarding/CollectionPicker.tsx`
- Create: `components/__tests__/onboarding/CollectionPicker.test.tsx`
- Modify: `app/(curator)/page.tsx`

- [ ] **Step 1: Write the failing test for `CollectionPicker`**

`components/__tests__/onboarding/CollectionPicker.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionPicker } from '@/components/onboarding/CollectionPicker'

const memberships = [
  { collectionId: 1, collectionName: 'My Bags', role: 'operator' as const, itemCount: 4 },
  { collectionId: 2, collectionName: "Mom's Bags", role: 'curator' as const, itemCount: 9 },
]

describe('CollectionPicker', () => {
  it('badges each collection with the user role', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByText(/operator/i)).toBeVisible()
    expect(screen.getByText(/curator/i)).toBeVisible()
  })

  it('links operator collections to the operator view', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByRole('link', { name: /my bags/i })).toHaveAttribute('href', '/collections/1')
  })

  it('links curator collections to the curator view', () => {
    render(<CollectionPicker memberships={memberships} />)
    expect(screen.getByRole('link', { name: /mom's bags/i })).toHaveAttribute('href', '/2')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/__tests__/onboarding/CollectionPicker.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `CollectionPicker`**

Reuse the existing `CollectionCard` look. For each membership render a `Link`:
`href = role === 'operator' ? \`/collections/${collectionId}\` : \`/${collectionId}\``,
with a small role badge. Add a "+ New collection" link to `/collections/new`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/__tests__/onboarding/CollectionPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite `app/(curator)/page.tsx` as the router**

Keep the demo branch and the `!session → /login` branch. Replace the
role-redirect + `getUserCollections` body with:
```tsx
const memberships = await getUserMemberships()
if (memberships.length === 0) {
  const invites = await db.collectionInvite.findMany({
    where: { email: session.user.email!, acceptedAt: null },
    include: { collection: { select: { name: true } } },
  })
  return <OnboardingScreen invites={invites.map(i => ({
    collectionId: i.collectionId, collectionName: i.collection.name, role: i.role,
  }))} />
}
return <CollectionPicker memberships={memberships.map(m => ({
  collectionId: m.collectionId,
  collectionName: m.collection.name,
  role: m.role,
  itemCount: m.collection.items.length,
}))} />
```
(Note: with invites auto-claimed on sign-in, a 0-membership user normally has 0
pending invites too; the invite branch matters only for edge timing. Keep it —
it is cheap and correct.)

- [ ] **Step 6: Manual smoke + commit**

Run: `npm run dev`, sign in as a brand-new email → expect OnboardingScreen.
```bash
git add components/onboarding/CollectionPicker.tsx \
  components/__tests__/onboarding/CollectionPicker.test.tsx app/\(curator\)/page.tsx
git commit -m "feat: / route is the post-auth router — onboarding vs picker (purses-72e)"
```

### Task 12: New-collection form role picker + AddCuratorForm

**Files:**
- Modify: `app/(operator)/collections/new/page.tsx`
- Create: `components/operator/AddCuratorForm.tsx`
- Create: `components/__tests__/operator/AddCuratorForm.test.tsx`

- [ ] **Step 1: Write the failing test for `AddCuratorForm`**

`components/__tests__/operator/AddCuratorForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddCuratorForm } from '@/components/operator/AddCuratorForm'

describe('AddCuratorForm', () => {
  it('renders an email field and an add button', () => {
    render(<AddCuratorForm collectionId={1} onAdd={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /add curator/i })).toBeVisible()
  })

  it('calls onAdd with the collection id and the entered email', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddCuratorForm collectionId={7} onAdd={onAdd} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'c@d.com')
    await userEvent.click(screen.getByRole('button', { name: /add curator/i }))
    expect(onAdd).toHaveBeenCalledWith(7, 'c@d.com')
  })
})
```
(`@testing-library/user-event` is already a transitive dep of
`@testing-library/react`; if vitest cannot resolve it, add it as an explicit
devDependency in a `chore:` commit.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/__tests__/operator/AddCuratorForm.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `AddCuratorForm`**

Client component, props `{ collectionId: number; onAdd: (id: number, email: string) => Promise<void> }`.
Email input + "Add curator" button; on submit call `onAdd(collectionId, email)`,
show a "Invited <email>" confirmation. The operator collection page
(`app/(operator)/collections/[id]/page.tsx`) renders it, passing
`addCuratorByEmail` (a server action) as `onAdd`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/__tests__/operator/AddCuratorForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the role picker to the new-collection form**

In `app/(operator)/collections/new/page.tsx`, add a radio group (operator /
curator, default operator) to the form; in `handleCreate`, read
`formData.get('role')` and pass it to `createCollection(name, description, role)`.
After create: if `role === 'operator'`, redirect to `/collections/${id}` (where
`AddCuratorForm` lives) instead of `/dashboard`; if `curator`, redirect to
`/${id}`.

- [ ] **Step 6: Wire `AddCuratorForm` into the operator collection page**

In `app/(operator)/collections/[id]/page.tsx`, render `<AddCuratorForm
collectionId={collectionId} onAdd={addCuratorByEmail} />`. (purses-90i is
hardening this page's ownership check — keep that; the `AddCuratorForm` is
additive.)

- [ ] **Step 7: Commit**
```bash
git add app/\(operator\)/collections/new/page.tsx \
  app/\(operator\)/collections/\[id\]/page.tsx \
  components/operator/AddCuratorForm.tsx \
  components/__tests__/operator/AddCuratorForm.test.tsx
git commit -m "feat: role picker on collection create + add-a-curator UI (purses-72e)"
```

---

## Batch 5: Wire-up, gating, and cleanup

### Task 13: `proxy.ts` drops role gating

**Files:**
- Modify: `proxy.ts`

> **Rebase note:** purses-90i may have changed the `/collections/*` branch to be
> "non-silent." This task removes role-gating entirely — per-collection authz is
> now enforced server-side (Tasks 5, 8) in pages/actions.

- [ ] **Step 1: Edit `proxy.ts`**

Remove the `role` lookup and the `/dashboard` / `/collections` role check
(lines ~31-36). Keep: the `/login` + `/api/auth` passthrough, the demo
default-deny block, and the `!isAuth → /login` redirect. The middleware is now
auth-only; authorization is per-collection and server-side.

- [ ] **Step 2: Verify with the existing e2e auth specs**

Run: `npm run e2e -- e2e/auth.spec.ts`
Expected: unauthenticated redirects still pass. (The "curator cannot access
operator routes" spec in `operator.spec.ts` is updated in Task 14.)

- [ ] **Step 3: Commit**
```bash
git add proxy.ts
git commit -m "refactor: proxy.ts is auth-only; per-collection authz moved server-side (purses-72e)"
```

### Task 14: Rework `e2e/fixtures.ts` + e2e specs

The fixtures forge a JWT with a `role` field that no longer exists; e2e auth
must instead seed real `User` + `CollectionMembership` rows.

**Files:**
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/operator.spec.ts`, `e2e/curator.spec.ts` (and any spec asserting role-based routing)

- [ ] **Step 1: Update `e2e/fixtures.ts`**

Drop `role` from the forged token payload (keep `sub`, `id`, `email`, `name`).
Add fixtures that, before forging the cookie, ensure the DB has the user and a
membership of the required role on a known seed collection — e.g. an
`operatorPage` fixture that upserts `CollectionMembership(seedCollectionId,
userId, 'operator')`, and a `curatorPage` that upserts a `curator` membership.
Use the demo collection (or a dedicated e2e collection seeded in
`e2e/global-setup.ts`) as the fixture collection.

- [ ] **Step 2: Update the affected specs**

- `operator.spec.ts` "header shows operator role indicator" — the operator
  layout still shows "operator" from the membership context; keep or adjust to
  the new header copy.
- `operator.spec.ts` "curator cannot access operator routes" — `/dashboard` and
  `/collections/[id]` are no longer middleware-gated; a curator hitting
  `/collections/[id]` of a collection they only curate should be rejected by
  the page's server-side `assertCollectionRole`. Re-point the assertion at that
  behavior (expect a not-found / redirect, not a middleware bounce).

- [ ] **Step 3: Run the e2e suite**

Run: `npm run e2e`
Expected: green. Fix any spec still assuming global roles.

- [ ] **Step 4: Commit**
```bash
git add e2e/fixtures.ts e2e/operator.spec.ts e2e/curator.spec.ts
git commit -m "test: e2e fixtures seed memberships instead of forging a role claim (purses-72e)"
```

### Task 15: Full gate suite

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Common fix-ups: stray `(session.user as { role?: string }).role`
reads, `getUserCollections` imports.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Unit + integration tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: E2E**

Run: `npm run e2e`
Expected: all green.

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: `prisma generate && next build` succeeds — this is the Vercel build.

- [ ] **Step 6: Commit any fix-ups**
```bash
git add -A
git commit -m "chore: gate-suite fix-ups for per-collection roles (purses-72e)"
```

---

## Self-Review

- **Spec coverage:** self-signup → Tasks 3–4; per-collection role → Tasks 1, 5,
  7, 8; add-a-curator → Tasks 6, 9, 12; onboarding/choose-existing-or-create →
  Tasks 10–11; role picker on create → Task 12; migration + demo survival →
  Tasks 1–2; proxy/authz move → Tasks 5, 8, 13; TDD throughout; gate suite →
  Task 15.
- **Open dependencies:** Tasks 10–13 may shift on Kimberly's answers to the four
  design Open Questions — flagged inline.
- **Type consistency:** `assertCollectionRole(collectionId, userId, required)`,
  `claimInvites(userId, email)`, `createCollection(name, description, role)`,
  `getUserMemberships()`, `addCuratorByEmail(collectionId, email)` — names used
  consistently across tasks and tests. The Prisma composite-key arg name
  `collectionId_userId` / `collectionId_email` must match the generated client
  (verify after Task 1's `prisma generate`).
- **Rebase risk:** `auth.ts`, `proxy.ts`, `actions/items.ts`, `actions/photos.ts`,
  and the operator collection/upload pages are touched by purses-90i / purses-0zq.
  Phase 4 rebases onto their merged state first (see Prerequisites).

## Execution Handoff

After Kimberly approves: rebase onto the merged siblings, then execute
task-by-task with `superpowers:test-driven-development` — failing test first,
minimal implementation, green, commit. Run the full gate suite (Task 15) before
`gt done`.
