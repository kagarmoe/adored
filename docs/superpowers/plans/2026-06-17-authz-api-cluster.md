# API Authz Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close cross-tenant write/IDOR holes in the `/api/sort-results/**`, `/api/sessions` list, and `/api/preferences` route families by reusing the two existing guard tiers — no new DAL, no role-model change.

**Architecture:** Add one `requireApiResultAccess` helper (sibling of `requireApiCollectionAccess`) that resolves a result then gates on collection-access **and** curator ownership. Apply it across the sort-results subtree. Curator-scope the session-list GETs via the existing `findByCollectionAndCurator`. Add the missing `requireApiCollectionAccess` membership gate to the preferences routes. Delete the dead `DecisionController`.

**Tech Stack:** Next.js App Router route handlers, Drizzle, Vitest, ephemeral Postgres (Docker) behind `RUN_DB_TESTS=1`.

## Global Constraints

- **Guard tiers (reuse, do not reinvent):** Tier 1 `requireApiCollectionAccess(db, collectionId, userId)` (404 absent / 403 non-member); Tier 2 `if (entity.curatorId !== userId) return 403` (curator ownership).
- **Ownership model (decided):** sort-results are **curator-scoped** — only `result.curatorId` may read/modify/finalize/share/supersede. Session-LIST GETs are **curator-scoped**.
- **Status codes:** 401 unauth, 404 absent (also for cross-tenant existence-hiding where the pattern already 404s), 403 member-but-forbidden / non-member.
- **DB tests:** live in `src/lib/db/*.integration.test.ts`, gated `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;`. Mock **only** `@/lib/auth` (flat-replace: `vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }))` — the spread form pulls in uninstalled nodemailer) and `@/lib/db` (`vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }))`). Everything else hits the real DB.
- **No `// eslint-disable @typescript-eslint/no-explicit-any`** (rule unregistered → lint error). Plain `as any` is fine.
- **Branch:** `security/authz-api-cluster-axn-51h-33u` (already created). Commit per task; never commit to main.
- **Pre-merge gates:** `npm run build`, `test:ci`, `lint`, `auth:verify`, `test:db` (Docker up). Judge **new** `tsc` errors only (~5 pre-existing in e2e specs + ScoringService.test.ts).

---

### Task 1: `requireApiResultAccess` helper

**Files:**
- Modify: `src/server/dal/collection-access.ts` (append helper)
- Test: `src/lib/db/sort-results-authz.integration.test.ts` (create; helper-level cases)

**Interfaces:**
- Consumes: `requireApiCollectionAccess(db, collectionId, userId)`, `SortResultRepository.findById(id)`, `SortResult` type (`{ id, collectionId, curatorId, ... }`).
- Produces: `requireApiResultAccess(db: Database, resultId: string, userId: string): Promise<SortResult | NextResponse>` — returns the result, or a `NextResponse` (404 absent, 403 non-member-or-non-curator).

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/sort-results-authz.integration.test.ts`:

```ts
// purses-axn: the whole /api/sort-results/** subtree was requireAuth()-only.
// RULE — sort-results are curator-scoped: only result.curatorId, AND a member of
// the result's collection, may act on it. Drives REAL handlers + the shared guard
// against ephemeral Postgres; mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { requireApiResultAccess } from "@/server/dal/collection-access";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Seed a collection owned by ownerId with one result whose curator is curatorId. */
async function seedResult(ownerId: string, curatorId: string) {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Result authz', 'active', now(), now())
  `);
  const result = await new SortResultRepository(db).create({
    collectionId, curatorId, name: "R", status: "draft",
  });
  return { collectionId, resultId: result.id };
}

async function addMember(collectionId: string, role: "curator" = "curator"): Promise<string> {
  const { db } = getTestDb();
  const memberId = generateId("user");
  await db.insert((await import("@/lib/db/schema")).user).values({
    id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
  });
  await new MembershipRepository(db).create({
    collectionId, userId: memberId, role,
    canManageCollection: false, canInviteMembers: false, canAddItems: true,
    canEditMetadata: true, canAddPhotos: true, canDeletePhotos: false,
    canSort: true, canViewOutputs: true,
  });
  return memberId;
}

describeDb("requireApiResultAccess (guard -> DB) — purses-axn", () => {
  let ownerId: string;
  beforeEach(async () => { await resetDb(); ownerId = await seedBaseline(); });
  afterAll(async () => { await closeDb(); });

  it("returns the result for its own curator (owner)", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    const out = await requireApiResultAccess(db, resultId, ownerId);
    expect(out).not.toBeInstanceOf(Response);
    expect((out as any).id).toBe(resultId);
  });

  it("403s a member of the collection who is NOT the result's curator (curator-scope)", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    const memberId = await addMember(collectionId);
    const out = await requireApiResultAccess(db, resultId, memberId);
    expect((out as Response).status).toBe(403);
  });

  it("403s a non-member hitting another tenant's result (IDOR)", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    const out = await requireApiResultAccess(db, resultId, "intruder_user");
    expect((out as Response).status).toBe(403);
  });

  it("404s an absent result id", async () => {
    const { db } = getTestDb();
    const out = await requireApiResultAccess(db, "res_does_not_exist", ownerId);
    expect((out as Response).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: FAIL — `requireApiResultAccess` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/server/dal/collection-access.ts` (add imports for `SortResult` type and `SortResultRepository`):

```ts
import type { Collection, SortResult } from "@/types";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

// Resolve a sort-result, then gate by collection access AND curator ownership
// (results are curator-scoped — each curator sorts independently, per t9l).
// Returns the result when the caller may act on it, else a NextResponse to return.
export async function requireApiResultAccess(
  db: Database,
  resultId: string,
  userId: string,
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

(Merge the `SortResult` import into the existing `import type { Collection } from "@/types"` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/dal/collection-access.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "feat(purses-axn): requireApiResultAccess guard (collection + curator scope)"
```

---

### Task 2: Guard sort-results `[id]` core routes (GET/PATCH/DELETE, finalize, supersede)

**Files:**
- Modify: `src/app/api/sort-results/[id]/route.ts` (GET, PATCH, DELETE)
- Modify: `src/app/api/sort-results/[id]/finalize/route.ts` (POST)
- Modify: `src/app/api/sort-results/[id]/supersede/route.ts` (POST)
- Test: `src/lib/db/sort-results-authz.integration.test.ts` (extend — route-level)

**Interfaces:**
- Consumes: `requireApiResultAccess` (Task 1), `getSession` from `@/lib/auth`.
- Produces: each handler now does `getSession`→401, `requireApiResultAccess(db, params.id, userId)`→return on `NextResponse`, then proceeds with the existing controller call.

- [ ] **Step 1: Write the failing route tests**

Append to `src/lib/db/sort-results-authz.integration.test.ts` (inside the same `describeDb`, add a nested block). Import the handlers at top of file:

```ts
import { GET as getResult, PATCH as patchResult, DELETE as deleteResult } from "@/app/api/sort-results/[id]/route";
import { POST as finalizeResult } from "@/app/api/sort-results/[id]/finalize/route";
```

```ts
describe("sort-results [id] route handlers", () => {
  function jsonReq(body?: unknown) {
    return new Request("http://localhost/api/sort-results/x", {
      method: "POST", headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("PATCH 403s a non-member (IDOR) and leaves the name unchanged", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await patchResult(jsonReq({ name: "HACKED" }) as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
    const after = await new SortResultRepository(db).findById(resultId);
    expect(after!.name).toBe("R");
  });

  it("PATCH 403s a member who is not the curator (curator-scope)", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    const memberId = await addMember(collectionId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await patchResult(jsonReq({ name: "X" }) as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
  });

  it("PATCH 200s for the curator and updates the name", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await patchResult(jsonReq({ name: "Renamed" }) as any, { params: { id: resultId } });
    expect(res.status).toBe(200);
    const after = await new SortResultRepository(db).findById(resultId);
    expect(after!.name).toBe("Renamed");
  });

  it("finalize 403s a non-member; stays draft", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await finalizeResult(jsonReq() as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
    const after = await new SortResultRepository(db).findById(resultId);
    expect(after!.status).toBe("draft");
  });

  it("GET 404s an absent result", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await getResult(new Request("http://localhost/x") as any, { params: { id: "res_missing" } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: FAIL — handlers still `requireAuth()` only (PATCH by intruder returns 200/500, not 403).

- [ ] **Step 3: Rewrite `src/app/api/sort-results/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { ResultController } from "@/server/api/results";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

async function guard(db: ReturnType<typeof getDb>, id: string) {
  const session = await getSession();
  if (!session?.user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await requireApiResultAccess(db, id, session.user.id);
  if (access instanceof NextResponse) return { res: access };
  return { userId: session.user.id };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const g = await guard(db, params.id);
  if (g.res) return g.res;
  const controller = new ResultController(new SortResultRepository(db));
  return NextResponse.json(await controller.getResult(params.id));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const g = await guard(db, params.id);
  if (g.res) return g.res;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const controller = new ResultController(new SortResultRepository(db));
  return NextResponse.json(await controller.updateResult(params.id, body));
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const g = await guard(db, params.id);
  if (g.res) return g.res;
  const controller = new ResultController(new SortResultRepository(db));
  await controller.deleteResult(params.id);
  return NextResponse.json({ message: "Result deleted" });
}
```

- [ ] **Step 4: Rewrite `finalize/route.ts` and `supersede/route.ts`**

`src/app/api/sort-results/[id]/finalize/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { ResultController } from "@/server/api/results";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiResultAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const controller = new ResultController(new SortResultRepository(db));
  return NextResponse.json(await controller.finalizeResult(params.id));
}
```

`src/app/api/sort-results/[id]/supersede/route.ts` — same shape, calling `controller.supersedeResult(params.id)` (keep the existing controller method; it throws "not implemented" — that's unchanged behavior, now behind the guard).

- [ ] **Step 5: Run tests; then commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.
Run: `npx vitest run src/app/api/sort-results` → existing route unit tests still green (or updated if they asserted the old `requireAuth` shape).

```bash
git add src/app/api/sort-results/\[id\]/route.ts src/app/api/sort-results/\[id\]/finalize/route.ts src/app/api/sort-results/\[id\]/supersede/route.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): guard sort-results [id] core routes (collection+curator)"
```

---

### Task 3: Guard sort-results `items` + `shares` routes (+ belongs-to-parent)

**Files:**
- Modify: `src/app/api/sort-results/[id]/items/route.ts` (GET)
- Modify: `src/app/api/sort-results/[id]/items/[rid]/route.ts` (GET/PATCH/DELETE)
- Modify: `src/app/api/sort-results/[id]/items/[rid]/reset/route.ts` (POST)
- Modify: `src/app/api/sort-results/[id]/shares/route.ts` (GET/POST)
- Modify: `src/app/api/sort-results/[id]/shares/[sid]/route.ts` (GET/PATCH/DELETE)
- Test: `src/lib/db/sort-results-authz.integration.test.ts` (extend — items/[rid] belongs-to-parent)

**Interfaces:**
- Consumes: `requireApiResultAccess` (Task 1), `SortResultItemRepository.findById(id)` → `SortResultItem { id, sortResultId, ... }`.
- Produces: every handler guards on `requireApiResultAccess(db, params.id, userId)`; `items/[rid]` additionally rejects an `rid` whose `sortResultId !== params.id` with 404.

- [ ] **Step 1: Write the failing belongs-to-parent test**

Append to `sort-results-authz.integration.test.ts`:

```ts
import { GET as getItem, PATCH as patchItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

describe("sort-results [id]/items/[rid] belongs-to-parent", () => {
  it("404s a result-item that belongs to a DIFFERENT result", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    // A second result in the same collection, with its own item.
    const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "draft" });
    const otherItem = await new SortResultItemRepository(db).create({
      sortResultId: other.id, itemId: generateId("item"), computedRank: 1, computedBucket: "top",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // Caller can access `resultId`, but asks for an item under `other.id`.
    const res = await getItem(new Request("http://localhost/x") as any, { params: { id: resultId, rid: otherItem.id } });
    expect(res.status).toBe(404);
  });
});
```

(Adjust `SortResultItemRepository.create` arg names to the real signature — read it first; use the same fields its `create` requires.)

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: FAIL — `items/[rid]` GET returns 200 for a mismatched parent.

- [ ] **Step 3: Rewrite the items routes**

`items/[rid]/route.ts` GET/PATCH/DELETE — pattern (shown for GET; PATCH/DELETE identical guard, then their existing controller call). DELETE must act on the verified `rid`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiResultAccess } from "@/server/dal/collection-access";
import { ResultItemController } from "@/server/api/result-items";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

async function guardItem(db: ReturnType<typeof getDb>, resultId: string, rid: string) {
  const session = await getSession();
  if (!session?.user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await requireApiResultAccess(db, resultId, session.user.id);
  if (access instanceof NextResponse) return { res: access };
  const item = await new SortResultItemRepository(db).findById(rid);
  if (!item || item.sortResultId !== resultId) return { res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { item };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string; rid: string } }) {
  const db = getDb();
  const g = await guardItem(db, params.id, params.rid);
  if (g.res) return g.res;
  return NextResponse.json(g.item);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; rid: string } }) {
  const db = getDb();
  const g = await guardItem(db, params.id, params.rid);
  if (g.res) return g.res;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const controller = new ResultItemController(new SortResultItemRepository(db));
  return NextResponse.json(await controller.updateResultItem(params.rid, body));
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; rid: string } }) {
  const db = getDb();
  const g = await guardItem(db, params.id, params.rid);
  if (g.res) return g.res;
  await new SortResultItemRepository(db).delete?.(params.rid); // ponytail: controller.deleteResultItem() is a no-op stub; if no repo.delete exists, leave the stub call but keep the guard. Confirm during impl.
  return NextResponse.json({ message: "Item removed from result" });
}
```

> Note: `ResultItemController.deleteResultItem()` is a no-op TODO. Do **not** add new delete business logic here (out of scope) — keep whatever the route did, but behind the guard. If `SortResultItemRepository` has no `delete`, revert the DELETE body to the original `controller.deleteResultItem()` call; the security fix is the guard, not the stub.

`items/route.ts` (GET list) and `items/[rid]/reset/route.ts` (POST): add `getSession`→401 + `requireApiResultAccess(db, params.id, userId)` before the existing controller call (no belongs-to-parent needed for the list; for `reset`, reuse `guardItem`).

- [ ] **Step 4: Rewrite the shares routes**

`shares/route.ts` (GET/POST) and `shares/[sid]/route.ts` (GET/PATCH/DELETE): add `getSession`→401 + `requireApiResultAccess(db, params.id, userId)` before the existing `ShareController` call. (Share-by-`sid` belongs-to-parent is a nice-to-have; the result-level curator guard already blocks cross-tenant access. Keep it minimal: result-level guard only.)

- [ ] **Step 5: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.

```bash
git add src/app/api/sort-results/\[id\]/items src/app/api/sort-results/\[id\]/shares src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): guard sort-results items+shares routes; items/[rid] belongs-to-parent"
```

---

### Task 4: Fix + guard `POST /api/sort-results` (route through repo, allocate number)

**Files:**
- Modify: `src/app/api/sort-results/route.ts` (POST)
- Test: `src/lib/db/sort-results-authz.integration.test.ts` (extend — POST)

**Interfaces:**
- Consumes: `requireApiCollectionAccess` (Tier 1), `SortResultRepository.create({ collectionId, curatorId, name, status })` (allocates `number`).
- Produces: POST that 403s a non-member, and on success returns a result with a **non-null `number`** and `curatorId === caller`.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { POST as createResult } from "@/app/api/sort-results/route";

describe("POST /api/sort-results", () => {
  function postReq(body: unknown) {
    return new Request("http://localhost/api/sort-results", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("403s creating a result in a collection the caller is not a member of", async () => {
    const { collectionId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await createResult(postReq({ collectionId, name: "X" }) as any);
    expect(res.status).toBe(403);
  });

  it("201s for a member and allocates a non-null number with curatorId = caller", async () => {
    const { collectionId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await createResult(postReq({ collectionId, name: "My ranking" }) as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.number).toEqual(expect.any(Number));
    expect(json.curatorId).toBe(ownerId);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: FAIL — intruder gets 201 (no access check); `number` is null.

- [ ] **Step 3: Rewrite `src/app/api/sort-results/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";

interface CreateResultRequest { collectionId: string; name: string }

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateResultRequest;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getDb();
  const access = await requireApiCollectionAccess(db, body.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const result = await new SortResultRepository(db).create({
    collectionId: body.collectionId,
    curatorId: session.user.id,
    name: body.name,
    status: "draft",
  });
  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 4: Run tests; update `SessionCompleteScreen.test.tsx` if it asserts the old body shape (drops `sessionId`); commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.
Run: `npx vitest run src/features/sessions/SessionCompleteScreen` → green (the screen still POSTs `{ sessionId, collectionId, name }`; the route now ignores `sessionId` — harmless).

```bash
git add src/app/api/sort-results/route.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): POST /api/sort-results routes through repo + collection guard (allocates number)"
```

---

### Task 5: Curator-scope the session-LIST GETs (purses-33u #1)

**Files:**
- Modify: `src/app/api/sessions/route.ts` (GET)
- Modify: `src/app/api/collections/[id]/sessions/route.ts` (GET)
- Test: `src/lib/db/session-list-authz.integration.test.ts` (create)

**Interfaces:**
- Consumes: `requireApiCollectionAccess`, `SessionRepository.findByCollectionAndCurator(collectionId, userId)`.
- Produces: both list GETs return only the caller's own sessions.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/session-list-authz.integration.test.ts`:

```ts
// purses-33u: session-LIST GETs leaked ALL curators' sessions to any member.
// RULE — list GETs are curator-scoped (match the already-scoped pages, t9l).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as flatList } from "@/app/api/sessions/route";
import { GET as nestedList } from "@/app/api/collections/[id]/sessions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("session-list curator scope (route -> DB) — purses-33u", () => {
  let ownerId: string, collectionId: string, memberId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'List scope', 'active', now(), now())`);
    memberId = generateId("user");
    await db.insert((await import("@/lib/db/schema")).user).values({ id: memberId, email: `m-${memberId}@adored.test`, name: "M" });
    await new MembershipRepository(db).create({
      collectionId, userId: memberId, role: "curator",
      canManageCollection: false, canInviteMembers: false, canAddItems: true, canEditMetadata: true,
      canAddPhotos: true, canDeletePhotos: false, canSort: true, canViewOutputs: true,
    });
    // Owner has a session; member has a session — same collection.
    await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await new SessionRepository(db).create({ collectionId, curatorId: memberId });
  });
  afterAll(async () => { await closeDb(); });

  it("flat GET /api/sessions returns only the caller's own sessions", async () => {
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await flatList(new Request(`http://localhost/api/sessions?collectionId=${collectionId}`) as any);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions.every((s: any) => s.curatorId === memberId)).toBe(true);
  });

  it("nested GET /api/collections/[id]/sessions returns only the caller's own", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await nestedList(new Request("http://localhost/x") as any, { params: { id: collectionId } });
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions.every((s: any) => s.curatorId === ownerId)).toBe(true);
  });

  it("flat GET 403s a non-member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await flatList(new Request(`http://localhost/api/sessions?collectionId=${collectionId}`) as any);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- session-list-authz`
Expected: FAIL — each list returns 2 sessions (both curators).

- [ ] **Step 3: Curator-scope the GETs**

In `src/app/api/sessions/route.ts` GET, replace the raw select:

```ts
  const sessions = await new SessionRepository(db).findByCollectionAndCurator(collectionId, session.user.id);
  return NextResponse.json(sessions);
```

(Remove the now-unused `sessionsTable`/`eq` imports.)

In `src/app/api/collections/[id]/sessions/route.ts` GET, replace `listSessions`:

```ts
  const sessions = await new SessionRepository(db).findByCollectionAndCurator(params.id, session.user.id);
  return NextResponse.json(sessions);
```

- [ ] **Step 4: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- session-list-authz` → PASS.

```bash
git add src/app/api/sessions/route.ts src/app/api/collections/\[id\]/sessions/route.ts src/lib/db/session-list-authz.integration.test.ts
git commit -m "fix(purses-33u): curator-scope session-list GETs (close cross-curator read leak)"
```

---

### Task 6: Add membership gate to preferences routes (purses-51h)

**Files:**
- Modify: `src/app/api/preferences/[collectionId]/route.ts` (GET)
- Modify: `src/app/api/collections/[id]/preferences/route.ts` (GET, DELETE)
- Test: `src/lib/db/preferences-authz.integration.test.ts` (create)

**Interfaces:**
- Consumes: `requireApiCollectionAccess`, `getSession`.
- Produces: GET + DELETE 403 a non-member; 200 a member; DELETE still self-scopes to `user.id`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/preferences-authz.integration.test.ts`:

```ts
// purses-51h: preferences routes were requireAuth()-only (no membership gate).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => {
  const m = mockGetSession;
  return { getSession: m, requireAuth: async () => { const s = await m(); if (!s?.user) throw new Error("Unauthorized"); return s.user; } };
});
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as flatPrefs } from "@/app/api/preferences/[collectionId]/route";
import { GET as nestedPrefs, DELETE as clearPrefs } from "@/app/api/collections/[id]/preferences/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("preferences route membership gate — purses-51h", () => {
  let ownerId: string, collectionId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Prefs gate', 'active', now(), now())`);
  });
  afterAll(async () => { await closeDb(); });

  it("flat GET 403s a non-member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await flatPrefs(new Request("http://localhost/x") as any, { params: { collectionId } });
    expect(res.status).toBe(403);
  });

  it("nested GET 200s the owner", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await nestedPrefs(new Request("http://localhost/x") as any, { params: { id: collectionId } });
    expect(res.status).toBe(200);
  });

  it("nested DELETE 403s a non-member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await clearPrefs(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: collectionId } });
    expect(res.status).toBe(403);
  });
});
```

> Note: these routes use `requireAuth()`, not `getSession()`. The mock above provides **both**, derived from the same `mockGetSession`, so existing `requireAuth` behavior (throw → 401) is preserved while the new `requireApiCollectionAccess` reads the same identity. Keep the `requireAuth()` call AND add the collection gate.

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- preferences-authz`
Expected: FAIL — non-member gets 200 (no gate).

- [ ] **Step 3: Add the gate to each handler**

In each handler, after `const user = await requireAuth();` and `const db = getDb();`, insert:

```ts
  const access = await requireApiCollectionAccess(db, /* params.collectionId | params.id */, user.id);
  if (access instanceof NextResponse) return access;
```

Import `requireApiCollectionAccess` from `@/server/dal/collection-access`. Flat route uses `params.collectionId`; nested route uses `params.id` (both GET and DELETE).

- [ ] **Step 4: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- preferences-authz` → PASS.

```bash
git add src/app/api/preferences src/app/api/collections/\[id\]/preferences/route.ts src/lib/db/preferences-authz.integration.test.ts
git commit -m "fix(purses-51h): add membership gate to preferences GET/DELETE routes"
```

---

### Task 7: Delete dead `DecisionController` (purses-33u #2)

**Files:**
- Delete: `src/server/api/decisions.ts`
- Delete (if exists): `src/server/api/decisions.test.ts`
- Verify: nothing imports `DecisionController` / `CreateDecisionInput`.

- [ ] **Step 1: Confirm dead**

Run: `grep -rn "DecisionController\|CreateDecisionInput\|api/decisions" src/ e2e/`
Expected: only the definition file (and possibly its own test). If any **other** importer exists, STOP — guard instead of delete, and note it.

- [ ] **Step 2: Delete**

```bash
git rm src/server/api/decisions.ts
git rm src/server/api/decisions.test.ts 2>/dev/null || true
```

- [ ] **Step 3: Verify build/lint**

Run: `npx tsc --noEmit 2>&1 | grep -v -E "e2e/|ScoringService.test" | grep "decisions" || echo "no new decisions errors"`
Run: `npm run lint`
Expected: no new errors referencing decisions.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(purses-33u): delete dead DecisionController (live route guards its own writes)"
```

---

### Task 8: Full gate run + follow-up beads

- [ ] **Step 1: Run the full gate suite**

```bash
npm run build
npm run test:ci
npm run lint
npm run auth:verify
RUN_DB_TESTS=1 npm run test:db
```

Expected: build OK; unit + DB tests green; lint clean; auth:verify OK. `tsc --noEmit` shows only the ~5 pre-existing errors (e2e specs + ScoringService.test.ts) — **no new** errors.

- [ ] **Step 2: File follow-up beads**

```bash
bd create "Remove unused flat-vs-nested duplicate session-list + preferences routes (post-DAL g6o)" -t chore -p 3
bd create "Sort-result sub-routes (shares/supersede/items) have stub controllers — confirm live or delete" -t chore -p 3
```

- [ ] **Step 3: Commit any remaining test/snapshot updates; push branch; open PR**

```bash
git push -u origin security/authz-api-cluster-axn-51h-33u
gh pr create --title "Close authz holes in sort-results / sessions / preferences APIs (purses-axn, 51h, 33u)" --body "<summary + test evidence>"
```

(PR opened **after** the adversarial code review of the implementation, per the project workflow. Note: E2E (Playwright) check SKIPS for API-only diffs — expected.)

---

## Self-Review

**Spec coverage:**
- axn (sort-results subtree) → Tasks 1–4. ✅ (helper, [id] core, items+shares, POST fix)
- 33u #1 (session-list leak) → Task 5. ✅
- 33u #2 (dead DecisionController) → Task 7. ✅
- 51h (preferences gate) → Task 6. ✅ (consolidation deliberately deferred — see spec "scope boundaries"; follow-up bead in Task 8)
- Tests un-mocked against ephemeral PG → Tasks 1,2,3,4,5,6 each add `*.integration.test.ts`. ✅

**Placeholder scan:** One `ponytail:` note in Task 3 DELETE flags a real uncertainty (stub `deleteResultItem`) with an explicit fallback ("revert to the original call; the security fix is the guard") — not a placeholder for missing content. The Task 8 PR body `<summary>` is filled at PR time from the review. Otherwise no TBD/TODO.

**Type consistency:** `requireApiResultAccess(db, resultId, userId): Promise<SortResult | NextResponse>` used identically in Tasks 1–4. `findByCollectionAndCurator(collectionId, userId)` matches the repo signature. `SortResultItem.sortResultId` matches `findByResult(sortResultId)`. `SortResultRepository.create({collectionId, curatorId, name, status})` matches the repo. ✅

**Known impl-time confirmations (call out, don't guess):** real arg names for `SortResultItemRepository.create` (Task 3 test) and whether `SortResultItemRepository` has a `delete` (Task 3 DELETE) — read before writing; fall back to the stub call if absent.
