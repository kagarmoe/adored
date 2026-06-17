# P0 Authz Hotfix (purses-uxh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the verified live cross-tenant read/write holes in the API by adding member-or-owner + belongs-to-parent authorization to the 8 affected routes and the 3 sort pages, each with route tests.

**Architecture:** Introduce one shared API guard, `requireApiCollectionAccess(db, collectionId, userId)`, returning the `Collection` or a `NextResponse` (404/403) to return immediately — the single correct member-or-owner check (the DAL chokepoint in purses-pv9 will later absorb it). Each route additionally verifies its child resource belongs to the collection (the `/file` route's proven `child.parentId === params.id` pattern). Sort pages verify `sortSession.collectionId === collection.id`.

**Tech Stack:** Next.js App Router route handlers, Drizzle, Vitest.

## Global Constraints

- **API routes are ULID-only** (the #190 "slug for nav, id for data" split): guard with `CollectionRepository.findById(params.id)`, never `findBySlug`. `params.id` at the API layer is always a ULID.
- **Page guards compare resolved objects, never raw URL segments:** `sortSession.collectionId === collection.id` (where `collection` came from `requireCollectionAccess`), NOT `=== params.id`. This stays correct after purses-9hl turns the URL segment into a slug.
- **Status codes (match the existing 4 good routes):** collection missing → **404**; child resource not belonging to the collection/parent → **404**; authenticated but not member-or-owner → **403**; unauthenticated → **401**.
- **Owner without a membership row is authorized** (`collection.ownerId === userId`). Every route test must include this case.
- This is the **hotfix only** — minimal per-route guards. The DAL refactor and role consolidation are the separate epic purses-pv9. Do not introduce the DAL here.
- TDD: failing test first, shown RED. All tests run in `npm run test:ci`. Comments WHY-only. TypeScript strict.

---

## File Structure

- **Create** `src/server/dal/collection-access.ts` — `requireApiCollectionAccess` guard.
- **Create** `src/server/dal/collection-access.test.ts` — guard unit tests.
- **Modify** the 8 route files + 3 sort pages listed per task; **create** a `route.test.ts` beside each route that lacks one.

Reference pattern (already correct, do not change): `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts` (load child → `child.parentId === params.id` → collection+membership → `membership || isOwner`). Test pattern: `src/app/api/collections/[id]/pool/group/route.test.ts`.

---

### Task 1: Shared API collection-access guard

**Files:**
- Create: `src/server/dal/collection-access.ts`
- Create: `src/server/dal/collection-access.test.ts`

**Interfaces:**
- Produces: `requireApiCollectionAccess(db: Database, collectionId: string, userId: string): Promise<Collection | NextResponse>` — returns the `Collection` when `userId` is owner or member; otherwise a `NextResponse` (404 if the collection doesn't exist, 403 if it exists but no access). Callers do `if (access instanceof NextResponse) return access;`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/dal/collection-access.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { collectionRepo, membershipRepo } = vi.hoisted(() => ({
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));

import { requireApiCollectionAccess } from "./collection-access";

const db = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "owner" });
  membershipRepo.findByUser.mockResolvedValue(null);
});

describe("requireApiCollectionAccess", () => {
  it("returns the collection for a member", async () => {
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    const r = await requireApiCollectionAccess(db, "c1", "u1");
    expect(r).toEqual({ id: "c1", ownerId: "owner" });
  });
  it("returns the collection for the owner without a membership row", async () => {
    const r = await requireApiCollectionAccess(db, "c1", "owner");
    expect(r).toEqual({ id: "c1", ownerId: "owner" });
  });
  it("returns 404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const r = await requireApiCollectionAccess(db, "c1", "u1");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(404);
  });
  it("returns 403 when neither member nor owner", async () => {
    const r = await requireApiCollectionAccess(db, "c1", "stranger");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/dal/collection-access.test.ts`
Expected: FAIL — cannot resolve `./collection-access`.

- [ ] **Step 3: Implement the guard**

```ts
// src/server/dal/collection-access.ts
import { NextResponse } from "next/server";
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// Member-or-owner gate for collection-scoped API routes. ULID-only (params.id at
// the API layer is always a ULID — slugs are a nav concern). Returns the collection
// when the user may access it, else a NextResponse the caller returns immediately:
// 404 if the collection is absent, 403 if it exists but the user is neither member
// nor owner. (purses-pv9's DAL will later absorb this single check.)
export async function requireApiCollectionAccess(
  db: Database,
  collectionId: string,
  userId: string,
): Promise<Collection | NextResponse> {
  const collection = await new CollectionRepository(db).findById(collectionId);
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const membership = await new MembershipRepository(db).findByUser(userId, collectionId);
  if (!membership && collection.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return collection;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/dal/collection-access.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/dal/collection-access.ts src/server/dal/collection-access.test.ts
git commit -m "feat(purses-uxh): requireApiCollectionAccess member-or-owner API guard"
```

---

### Task 2: Invitations route — scope GET, authorize POST

**Files:**
- Modify: `src/app/api/collections/[id]/invitations/route.ts`
- Create: `src/app/api/collections/[id]/invitations/route.test.ts`

> HOLE 1: GET ignores `params.id` and lists invitations unscoped (token+email leak). HOLE 2: POST creates an invitation in any collection with no access check.

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); `InvitationRepository.findByCollection(collectionId)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/collections/[id]/invitations/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, collectionRepo, membershipRepo, invRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  invRepo: { findByCollection: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/InvitationRepository", () => ({ InvitationRepository: vi.fn(() => invRepo) }));

import { GET, POST } from "./route";

const req = (body?: any) => ({ json: async () => body, url: "http://localhost" }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  invRepo.findByCollection.mockResolvedValue([{ id: "inv1", collectionId: "c1" }]);
  invRepo.create.mockResolvedValue({ id: "inv2", collectionId: "c1" });
});

describe("GET invitations", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(401);
  });
  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(403);
  });
  it("returns only this collection's invitations for a member", async () => {
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(invRepo.findByCollection).toHaveBeenCalledWith("c1");
  });
  it("allows the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });
});

describe("POST invitations", () => {
  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await POST(req({ email: "x@y.z" }), { params: { id: "c1" } })).status).toBe(403);
  });
  it("creates for a member", async () => {
    expect((await POST(req({ email: "x@y.z" }), { params: { id: "c1" } })).status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/collections/[id]/invitations/route.test.ts"`
Expected: FAIL — GET lists unscoped / no 403.

- [ ] **Step 3: Implement the guarded route**

```ts
// src/app/api/collections/[id]/invitations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { InvitationController } from "@/server/api/invitations";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const invitations = await new InvitationRepository(db).findByCollection(params.id);
  return NextResponse.json(invitations);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  try {
    const controller = new InvitationController(new InvitationRepository(db));
    const invitation = await controller.createInvitation(params.id, body);
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/collections/[id]/invitations/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/collections/[id]/invitations/route.ts" "src/app/api/collections/[id]/invitations/route.test.ts"
git commit -m "fix(purses-uxh): scope+authorize collection invitations (token leak / self-invite)"
```

---

### Task 3: Decisions route — authorize before write, fix write-before-check

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/route.ts`
- Create: `src/app/api/sessions/[id]/decisions/route.test.ts`

> HOLE 3: getSession-only; it INSERTS the decision (line 30) BEFORE loading the session (line 39) — cross-tenant write poisoning. Load+authorize the session's collection first, then write.

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); `SessionRepository.findById`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/sessions/[id]/decisions/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, insertReturning, sessionRepo, collectionRepo, membershipRepo, prefRecalc } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  insertReturning: vi.fn(),
  sessionRepo: { findById: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  prefRecalc: vi.fn(),
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => ({})) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => ({})) }));
vi.mock("@/server/services/ScoringService", () => ({ ScoringService: vi.fn(() => ({})) }));
vi.mock("@/server/services/PreferenceStateService", () => ({ PreferenceStateService: vi.fn(() => ({ recalculatePreferences: prefRecalc })) }));

import { POST } from "./route";

const req = (body: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  // db.insert(...).values(...).returning() chain
  insertReturning.mockResolvedValue([{ id: "event1" }]);
  mockGetDb.mockReturnValue({ insert: () => ({ values: () => ({ returning: insertReturning }) }) });
  sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
});

describe("POST decisions", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } })).status).toBe(401);
  });
  it("404 when the session does not exist — and does NOT write", async () => {
    sessionRepo.findById.mockResolvedValue(null);
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(404);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("403 when the session's collection isn't accessible — and does NOT write", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("201 and writes for a member", async () => {
    const res = await POST(req({ type: "triage", decision: {} }), { params: { id: "s1" } });
    expect(res.status).toBe(201);
    expect(insertReturning).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/sessions/[id]/decisions/route.test.ts"`
Expected: FAIL — current code writes before checking (404/403 cases would still insert).

- [ ] **Step 3: Implement (authorize first, then write)**

```ts
// src/app/api/sessions/[id]/decisions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import { ScoringService } from "@/server/services/ScoringService";

interface DecisionRequest {
  type: "triage" | "pairwise_compare" | "bucket_assign";
  decision: Record<string, unknown>;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  // Authorize BEFORE any write: the session must belong to a collection the user can access.
  const sessionRepo = new SessionRepository(db);
  const sortSession = await sessionRepo.findById(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const body: DecisionRequest = await req.json();
  try {
    const [event] = await db.insert(decisionEventsTable).values({
      id: generateId("event"),
      sessionId: params.id,
      type: body.type,
      decision: body.decision,
    }).returning();

    const decisionRepo = new DecisionEventRepository(db);
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const scoringService = new ScoringService(decisionRepo, sessionRepo);
    const prefService = new PreferenceStateService(prefRepo, scoringService);
    await prefService.recalculatePreferences(sortSession.collectionId, session.user.id);

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to record decision" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/sessions/[id]/decisions/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/route.ts" "src/app/api/sessions/[id]/decisions/route.test.ts"
git commit -m "fix(purses-uxh): authorize session before recording decisions (cross-tenant write)"
```

---

### Task 4: `/api/sessions` POST+GET — authorize the collection

**Files:**
- Modify: `src/app/api/sessions/route.ts`
- Create: `src/app/api/sessions/route.test.ts`

> HOLE 4: POST takes `collectionId` from the body and GET from the query, both with no access check.

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/sessions/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, insertReturning, selectWhere, collectionRepo, membershipRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  insertReturning: vi.fn(),
  selectWhere: vi.fn(),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));

import { POST, GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  insertReturning.mockResolvedValue([{ id: "s1" }]);
  selectWhere.mockResolvedValue([{ id: "s1" }]);
  mockGetDb.mockReturnValue({
    insert: () => ({ values: () => ({ returning: insertReturning }) }),
    select: () => ({ from: () => ({ where: selectWhere }) }),
  });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
});

const postReq = (body: any) => ({ json: async () => body }) as any;
const getReq = (cid?: string) => ({ url: `http://localhost/api/sessions${cid ? `?collectionId=${cid}` : ""}` }) as any;

describe("POST /api/sessions", () => {
  it("401 unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST(postReq({ collectionId: "c1" }))).status).toBe(401);
  });
  it("403 when not member or owner — and does NOT insert", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(postReq({ collectionId: "c1" }));
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("201 for a member", async () => {
    expect((await POST(postReq({ collectionId: "c1" }))).status).toBe(201);
  });
});

describe("GET /api/sessions", () => {
  it("400 without collectionId", async () => {
    expect((await GET(getReq())).status).toBe(400);
  });
  it("403 when not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(getReq("c1"))).status).toBe(403);
  });
  it("200 for a member", async () => {
    expect((await GET(getReq("c1"))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/sessions/route.test.ts"`
Expected: FAIL — no 403 path.

- [ ] **Step 3: Implement**

```ts
// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const [newSession] = await db.insert(sessionsTable).values({
    id: generateId("session"),
    collectionId,
    curatorId: session.user.id,
    goal,
    status: "active",
  }).returning();
  return NextResponse.json(newSession, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const collectionId = new URL(req.url).searchParams.get("collectionId");
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
  return NextResponse.json(sessions);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/sessions/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/route.ts" "src/app/api/sessions/route.test.ts"
git commit -m "fix(purses-uxh): authorize collection on session create/list"
```

---

### Task 5: `/api/sessions/[id]` GET/PATCH/DELETE — authorize the session's collection

**Files:**
- Modify: `src/app/api/sessions/[id]/route.ts`
- Create: `src/app/api/sessions/[id]/route.test.ts`

> HOLE 5: all three load the session by id with no collection access check — fetch/update/delete any session.

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); `SessionRepository.findById`. The route loads the session first (to get `collectionId`) then guards, then delegates to the existing `SessionController`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/sessions/[id]/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, sessionRepo, collectionRepo, membershipRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  sessionRepo: { findById: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  ctrl: { getSession: vi.fn(), updateSession: vi.fn(), deleteSession: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/api/sessions", () => ({ SessionController: vi.fn(() => ctrl) }));

import { GET, PATCH, DELETE } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  ctrl.getSession.mockResolvedValue({ id: "s1" });
  ctrl.updateSession.mockResolvedValue({ id: "s1" });
  ctrl.deleteSession.mockResolvedValue(undefined);
});

describe("/api/sessions/[id]", () => {
  it("GET 404 when the session does not exist", async () => {
    sessionRepo.findById.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(404);
  });
  it("GET 403 when the session's collection isn't accessible", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(403);
  });
  it("GET 200 for a member", async () => {
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(200);
  });
  it("PATCH 403 when not accessible — and does NOT update", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await PATCH(req({ goal: "x" }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.updateSession).not.toHaveBeenCalled();
  });
  it("DELETE 403 when not accessible — and does NOT delete", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.deleteSession).not.toHaveBeenCalled();
  });
  it("DELETE 200 for the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await DELETE(req(), { params: { id: "s1" } })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/sessions/[id]/route.test.ts"`
Expected: FAIL — no 403/404 access paths.

- [ ] **Step 3: Implement (shared guard helper inside the file)**

```ts
// src/app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

// Load the session, then authorize its collection. Returns the controller-ready
// repo + a typed guard outcome, or a NextResponse to return immediately.
async function authorizeSession(db: ReturnType<typeof getDb>, sessionId: string, userId: string) {
  const sessionRepo = new SessionRepository(db);
  const sortSession = await sessionRepo.findById(sessionId);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, userId);
  if (access instanceof NextResponse) return access;
  return { sessionRepo };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  const result = await new SessionController(guard.sessionRepo).getSession(params.id);
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  const result = await new SessionController(guard.sessionRepo).updateSession(params.id, body);
  return NextResponse.json(result);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const guard = await authorizeSession(db, params.id, session.user.id);
  if (guard instanceof NextResponse) return guard;
  await new SessionController(guard.sessionRepo).deleteSession(params.id);
  return NextResponse.json({ message: "Session deleted" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/sessions/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/route.ts" "src/app/api/sessions/[id]/route.test.ts"
git commit -m "fix(purses-uxh): authorize session's collection on get/update/delete"
```

---

### Task 6: `/api/collections/[id]/items` GET/POST — authorize the collection

**Files:**
- Modify: `src/app/api/collections/[id]/items/route.ts`
- Create: `src/app/api/collections/[id]/items/route.test.ts`

> HOLE 6: list/create items in any collection (auth-only).

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); delegates to the existing `ItemController`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/collections/[id]/items/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, collectionRepo, membershipRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  ctrl: { listItems: vi.fn(), createItem: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/api/items", () => ({ ItemController: vi.fn(() => ctrl) }));

import { GET, POST } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  ctrl.listItems.mockResolvedValue([]);
  ctrl.createItem.mockResolvedValue({ id: "item1" });
});

describe("/api/collections/[id]/items", () => {
  it("GET 403 when not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(403);
  });
  it("GET 200 for a member", async () => {
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });
  it("POST 403 when not member or owner — and does NOT create", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(req({ name: "x" }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(ctrl.createItem).not.toHaveBeenCalled();
  });
  it("POST 201 for the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await POST(req({ name: "x" }), { params: { id: "c1" } })).status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/collections/[id]/items/route.test.ts"`
Expected: FAIL — no 403 path.

- [ ] **Step 3: Implement**

```ts
// src/app/api/collections/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { ItemController } from "@/server/api/items";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const items = await new ItemController(new ItemRepository(db)).listItems(params.id);
  return NextResponse.json(items);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const item = await new ItemController(new ItemRepository(db)).createItem(params.id, body);
  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/collections/[id]/items/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/collections/[id]/items/route.ts" "src/app/api/collections/[id]/items/route.test.ts"
git commit -m "fix(purses-uxh): authorize collection on item list/create"
```

---

### Task 7: set-hero — verify the item→collection and photo→item chain + access

**Files:**
- Modify: `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.ts`
- Create: `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts`

> HOLE 7: `params.id` is ignored; no item→collection, photo→item, or access check. Mirror the `/file` route chain.

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); `ItemRepository.findById`, `PhotoRepository.findById`, `PhotoRepository.setHero`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, itemRepo, photoRepo, collectionRepo, membershipRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  itemRepo: { findById: vi.fn() },
  photoRepo: { findById: vi.fn(), setHero: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));

import { POST } from "./route";

const params = { id: "c1", itemId: "i1", photoId: "p1" };
const call = () => POST({} as any, { params });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  itemRepo.findById.mockResolvedValue({ id: "i1", collectionId: "c1" });
  photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "i1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  photoRepo.setHero.mockResolvedValue(undefined);
});

describe("POST set-hero", () => {
  it("401 unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
  it("404 when the item is not in the collection — and does NOT set hero", async () => {
    itemRepo.findById.mockResolvedValue({ id: "i1", collectionId: "OTHER" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });
  it("404 when the photo is not on the item", async () => {
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "OTHER" });
    expect((await call()).status).toBe(404);
  });
  it("403 when not member or owner — and does NOT set hero", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(403);
    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });
  it("200 for a member; sets hero with the right ids", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(photoRepo.setHero).toHaveBeenCalledWith("p1", "i1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts"`
Expected: FAIL — current route sets hero with no checks.

- [ ] **Step 3: Implement**

```ts
// src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string; photoId: string } }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const item = await new ItemRepository(db).findById(params.itemId);
  if (!item || item.collectionId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photoRepo = new PhotoRepository(db);
  const photo = await photoRepo.findById(params.photoId);
  if (!photo || photo.itemId !== params.itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;

  try {
    await photoRepo.setHero(params.photoId, params.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Set hero failed" }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.ts" "src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts"
git commit -m "fix(purses-uxh): set-hero verifies item/photo belong to collection + access"
```

---

### Task 8: members/[mid] — verify the membership belongs to the collection + guard GET

**Files:**
- Modify: `src/app/api/collections/[id]/members/[mid]/route.ts`
- Create: `src/app/api/collections/[id]/members/[mid]/route.test.ts`

> HOLE 8: GET has no access check; all three load membership `[mid]` without verifying it belongs to collection `[id]` (cross-collection membership read/update/delete).

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Task 1); `MembershipRepository.findById` (returns `{ id, collectionId, userId, ... }`), the existing `MemberController` (`getMember`, `isCollectionManager`, `updateMember`, `removeMember`).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/collections/[id]/members/[mid]/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  membershipRepo: { findById: vi.fn(), findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  ctrl: { getMember: vi.fn(), isCollectionManager: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn() },
}));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<any>()), getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/api/members", () => ({ MemberController: vi.fn(() => ctrl) }));

import { GET, PATCH, DELETE } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;
const p = { id: "c1", mid: "m2" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "c1", userId: "u5" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  ctrl.getMember.mockResolvedValue({ id: "m2", collectionId: "c1" });
  ctrl.isCollectionManager.mockResolvedValue(true);
  ctrl.updateMember.mockResolvedValue({ id: "m2" });
  ctrl.removeMember.mockResolvedValue(undefined);
});

describe("/api/collections/[id]/members/[mid]", () => {
  it("GET 403 when caller is not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: p })).status).toBe(403);
  });
  it("GET 404 when the membership belongs to another collection", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    expect((await GET(req(), { params: p })).status).toBe(404);
  });
  it("GET 200 for a member", async () => {
    expect((await GET(req(), { params: p })).status).toBe(200);
  });
  it("PATCH 404 when the membership belongs to another collection — and does NOT update", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    const res = await PATCH(req({ canAddItems: true }), { params: p });
    expect(res.status).toBe(404);
    expect(ctrl.updateMember).not.toHaveBeenCalled();
  });
  it("PATCH 403 when caller is not a manager", async () => {
    ctrl.isCollectionManager.mockResolvedValue(false);
    expect((await PATCH(req({ canAddItems: true }), { params: p })).status).toBe(403);
  });
  it("DELETE 404 when the membership belongs to another collection — and does NOT remove", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    const res = await DELETE(req(), { params: p });
    expect(res.status).toBe(404);
    expect(ctrl.removeMember).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/collections/[id]/members/[mid]/route.test.ts"`
Expected: FAIL — GET has no 403; cross-collection mid not 404.

- [ ] **Step 3: Implement**

```ts
// src/app/api/collections/[id]/members/[mid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { MemberController } from "@/server/api/members";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

// Verify the [mid] membership row actually belongs to collection [id] (belongs-to-parent).
async function membershipBelongsToCollection(db: ReturnType<typeof getDb>, mid: string, collectionId: string) {
  const row = await new MembershipRepository(db).findById(mid);
  return !!row && row.collectionId === collectionId;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  return NextResponse.json(await ctrl.getMember(params.mid));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = getDb();
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  if (!(await ctrl.isCollectionManager(params.id, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await ctrl.updateMember(params.mid, body));
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!(await membershipBelongsToCollection(db, params.mid, params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctrl = new MemberController(new MembershipRepository(db), new CollectionRepository(db));
  if (!(await ctrl.isCollectionManager(params.id, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await ctrl.removeMember(params.mid);
  return NextResponse.json({ message: "Member removed" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/collections/[id]/members/[mid]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/collections/[id]/members/[mid]/route.ts" "src/app/api/collections/[id]/members/[mid]/route.test.ts"
git commit -m "fix(purses-uxh): members/[mid] belongs-to-parent + guard GET"
```

---

### Task 9: Sort pages — verify the session belongs to the resolved collection

**Files:**
- Modify: `src/app/collections/[id]/sort/[sessionId]/page.tsx`, `.../triage/page.tsx`, `.../compare/page.tsx`
- Create: `src/app/collections/[id]/sort/[sessionId]/page.test.tsx`

> HOLE 9: each loads the session by id and only checks it exists, not that `sortSession.collectionId === collection.id`. Add the integrity guard against the RESOLVED `collection.id` (slug-safe for purses-9hl).

**Interfaces:**
- Consumes: `requireCollectionAccess` (returns the resolved `Collection`), `SessionRepository.findById`.

- [ ] **Step 1: Write the failing test** (drives the session-detail page; the same guard is added to all three)

```tsx
// src/app/collections/[id]/sort/[sessionId]/page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findById: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => decisionRepo) }));

import SessionDetailPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "Summer Bags" });
  decisionRepo.findBySession.mockResolvedValue([]);
});

describe("SessionDetailPage session/collection integrity", () => {
  it("redirects when the session belongs to a different collection", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "coll_OTHER", status: "active" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionId: "s1" } })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });
  it("renders when the session belongs to the resolved collection", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", status: "active" });
    const ui = await SessionDetailPage({ params: { id: "summer-bags", sessionId: "s1" } });
    render(ui);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

> If the session-detail page constructs additional repos, add them to the mock list (read the file first). The two assertions — redirect on mismatch, render on match — are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/page.test.tsx"`
Expected: FAIL — mismatch currently renders (no integrity guard).

- [ ] **Step 3: Add the guard to all three pages**

In each of `sort/[sessionId]/page.tsx`, `sort/[sessionId]/triage/page.tsx`, `sort/[sessionId]/compare/page.tsx`, find the existing block:

```tsx
  if (!sortSession) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }
```

and replace it with (note: `compare` loads the session into a variable also named `sortSession`; match the local name in each file):

```tsx
  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }
```

- [ ] **Step 4: Run test + the existing triage/compare tests to verify no regression**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionId]/page.test.tsx" "src/app/collections/[id]/sort/[sessionId]/triage/page.test.tsx" "src/app/collections/[id]/sort/[sessionId]/compare/page.test.tsx"`
Expected: PASS (the nkp triage/compare tests use a session whose `collectionId` matches the resolved collection — update those fixtures' session mock to include `collectionId: "coll_01ABCDEF"` if they don't already, so the new guard passes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/collections/[id]/sort/[sessionId]/page.tsx" "src/app/collections/[id]/sort/[sessionId]/triage/page.tsx" "src/app/collections/[id]/sort/[sessionId]/compare/page.tsx" "src/app/collections/[id]/sort/[sessionId]/page.test.tsx"
git commit -m "fix(purses-uxh): sort pages verify session belongs to the resolved collection"
```

---

### Task 10: Full gate

- [ ] **Step 1:** `npm run build && npm run test:ci && npm run lint` — all green.
- [ ] **Step 2:** `npm run auth:verify` — the auth-wiring check passes.
- [ ] **Step 3:** Confirm no new lint/type errors from the added imports.

---

## Self-Review

**Spec coverage (the 9 holes):** invitations GET leak (T2) + POST self-invite (T2); decisions cross-tenant write incl. write-before-check (T3); sessions create/list (T4); sessions get/update/delete (T5); items list/create (T6); set-hero chain+access (T7); members/[mid] belongs-to-parent + GET guard (T8); sort pages integrity (T9). Shared guard (T1). **All 9 covered.**

**Placeholder scan:** none — every route has full before/after code and a full test. The only "read the file first" note is in T9 for additional repos a page may construct (the guard itself is fully specified).

**Type consistency:** `requireApiCollectionAccess(db, collectionId, userId) → Collection | NextResponse` used identically across T2–T8; the `if (x instanceof NextResponse) return x` discriminator is consistent; `membershipBelongsToCollection` (T8) and `authorizeSession` (T5) are file-local helpers, not cross-task.

**Security invariants:** every guarded route test includes 401, 403, the owner-without-membership success, and (where a child exists) the belongs-to-parent 404 + a "does NOT write/update/delete/setHero" assertion proving the guard precedes the side effect. Page guards compare `sortSession.collectionId === collection.id` (resolved), slug-safe for purses-9hl.
