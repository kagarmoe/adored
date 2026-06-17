# API Authz Cluster Implementation Plan (v2 — post adversarial-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close cross-tenant write/IDOR holes in the `/api/sort-results/**`, `/api/sessions` list, and `/api/preferences` route families by reusing the two existing guard tiers — no new DAL, no role-model change.

**Architecture:** Add one `requireApiResultAccess` helper (sibling of `requireApiCollectionAccess`) that resolves a result then gates on collection-access **and** curator ownership. Apply it across the sort-results subtree by **injecting a guard into each handler's existing shape** (keep the current `try/catch` + `requireAuth`/`getSession` idiom; narrow with `instanceof NextResponse` — the proven `authorizeSession` pattern). Add belongs-to-parent checks where a child id (`rid`, `sid`) is resolved independently. Curator-scope the session-list GETs via the existing `findByCollectionAndCurator`. Add the missing membership gate to the preferences routes. Gate `<SharePanel>` render on curator ownership so the now-curator-scoped shares API can't 403 a rendered button. Delete the dead `DecisionController`.

**Tech Stack:** Next.js App Router route handlers, Drizzle, Vitest, ephemeral Postgres (Docker) behind `RUN_DB_TESTS=1`.

## Adversarial-review findings folded into v2

| # | Finding | Resolution |
|---|---------|-----------|
| F1 (Security, BLOCK) | `shares/[sid]` GET/PATCH/DELETE resolve the share by `sid` alone → IDOR (revoke/read any tenant's share via your own result id). | Task 3: add belongs-to-parent (`share.sortResultId !== params.id → 404`), symmetric with `items/[rid]`. + test. |
| F2 (Architect, HIGH) | Results detail page only collection-scopes, renders `<SharePanel>` for any finalized result → non-curator gets 403-on-click after the API is curator-scoped. | **Task 4b (new):** gate `<SharePanel>` render on `result.curatorId === session.user.id`. + page test. |
| Convergent (all 4) | Plan's `new SortResultItemRepository(db).delete?.(rid)` calls a method that doesn't exist (fabricated). | Task 3: remove it; keep the existing `controller.deleteResultItem()` no-op behind the guard, with a `// ponytail:` note + follow-up bead (pre-existing stub, out of authz scope). |
| Convergent (Architect F1/F6, QA, Craftsman C1) | `{ res?, userId? }` guard envelope doesn't narrow under strict TS; wholesale handler rewrite dropped the `try/catch`, losing structured error responses + risking stack leaks. | Tasks 2–4: **don't rewrite handlers.** Inject `requireApiResultAccess` inline, keep the existing `try/catch` + idiom, narrow via `instanceof NextResponse`. |
| F-QA (BLOCK) | belongs-to-parent test seeded `itemId: generateId("item")` → FK violation `23503` at setup (`sort_result_items.item_id` → `items.id`). | Task 3 test: create a real item via `ItemRepository.create({ collectionId })` and use `item.id`. |
| F-QA (coverage) | shares/items/reset guards untested; prefs DELETE self-scope unverified. | Task 3 + Task 6: add 403 tests for shares + items-list + reset; add prefs DELETE member-200/self-scope test. |
| Craftsman C5 | Task 4 leaves `sortResultsTable` + `generateId` imports dead after routing through the repo. | Task 4: remove the dead imports. |
| Caller analysis | Live callers: PATCH `[id]`, POST `finalize`, POST `shares`, DELETE `shares/[sid]`. The rest (GET/DELETE `[id]`, `items/**`, `supersede`, `shares` GET, `shares/[sid]` GET/PATCH) are dead-but-reachable. | Honor the decided "guard the whole subtree." **Deletion** of dead stub routes is deferred to a follow-up bead (a product call about the results feature's intended surface — not for a security PR). |

## Global Constraints

- **Guard tiers (reuse, do not reinvent):** Tier 1 `requireApiCollectionAccess(db, collectionId, userId)` (404 absent / 403 non-member); Tier 2 `if (entity.curatorId !== userId) return 403` — both bundled into the new `requireApiResultAccess`.
- **Guard injection pattern (the only sanctioned shape):** inside each handler's existing `try`, after resolving the user + `db`:
  ```ts
  const result = await requireApiResultAccess(db, params.id, user.id);
  if (result instanceof NextResponse) return result;
  ```
  Keep the handler's existing `try/catch` and its existing auth call (`requireAuth()` or `getSession()`); do not rewrite the rest. `requireApiResultAccess` returns a `NextResponse` (403/404) that is returned directly (bypasses the catch); `requireAuth()`'s "Unauthorized" throw is still mapped to 401 by the existing catch.
- **Ownership model (decided):** sort-results are **curator-scoped** — only `result.curatorId` (who must also be a collection member) may read/modify/finalize/share/supersede. Session-LIST GETs are **curator-scoped**.
- **DB tests:** `src/lib/db/*.integration.test.ts`, gated `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;` (auto-collected by the CI `db-tests` job glob `src/lib/db` and `e2e/fixtures/run-db-tests.sh`). Mock **only** `@/lib/auth` (flat-replace; spread form pulls in nodemailer) and `@/lib/db`. Everything else hits the real DB. Seed real FK parents (collections, items) before inserting children.
- **No `// eslint-disable @typescript-eslint/no-explicit-any`** (rule unregistered → lint error). Plain `as any` is fine.
- **Branch:** `security/authz-api-cluster-axn-51h-33u` (created). Commit per task; never to main.
- **Pre-merge gates:** `npm run build`, `test:ci`, `lint`, `auth:verify`, `RUN_DB_TESTS=1 npm run test:db` (Docker up). Judge **new** `tsc` errors only (~5 pre-existing in e2e specs + ScoringService.test.ts).

---

### Task 1: `requireApiResultAccess` helper

**Files:**
- Modify: `src/server/dal/collection-access.ts` (append helper; extend the `@/types` import with `SortResult`)
- Test: `src/lib/db/sort-results-authz.integration.test.ts` (create; helper-level cases)

**Interfaces:**
- Consumes: `requireApiCollectionAccess(db, collectionId, userId)`, `SortResultRepository.findById(id)`, `SortResult` (`{ id, collectionId, curatorId, ... }`).
- Produces: `requireApiResultAccess(db: Database, resultId: string, userId: string): Promise<SortResult | NextResponse>` — the result, or 404 (absent) / 403 (non-member or non-curator).

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
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH exports the routes use, derived from one spy (spread form pulls in nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
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

/** Add a distinct member (curator role, full sort access) to the collection. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = generateId("user");
  await db.insert((await import("@/lib/db/schema")).user).values({
    id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
  });
  await new MembershipRepository(db).create({
    collectionId, userId: memberId, role: "curator",
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

  it("403s a collection member who is NOT the result's curator (curator-scope)", async () => {
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

In `src/server/dal/collection-access.ts`: change `import type { Collection } from "@/types";` to `import type { Collection, SortResult } from "@/types";`, add `import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";`, then append:

```ts
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

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/server/dal/collection-access.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "feat(purses-axn): requireApiResultAccess guard (collection + curator scope)"
```

---

### Task 2: Guard sort-results `[id]` routes (GET/PATCH/DELETE, finalize, supersede) — inline injection

**Files:**
- Modify: `src/app/api/sort-results/[id]/route.ts`, `.../finalize/route.ts`, `.../supersede/route.ts`
- Test: extend `sort-results-authz.integration.test.ts`

**Interfaces:**
- Consumes: `requireApiResultAccess` (Task 1), existing `requireAuth()`.
- Produces: each handler returns 401 (unauth), 404 (absent), 403 (non-member/non-curator) before its controller call; otherwise unchanged behavior + error handling.

- [ ] **Step 1: Write the failing route tests**

Append to `sort-results-authz.integration.test.ts` (add handler imports at top):

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

  it("PATCH 403s a non-member and leaves the name unchanged (IDOR)", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await patchResult(jsonReq({ name: "HACKED" }) as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
    expect((await new SortResultRepository(db).findById(resultId))!.name).toBe("R");
  });

  it("PATCH 403s a member who is not the curator (curator-scope)", async () => {
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
    expect((await new SortResultRepository(db).findById(resultId))!.name).toBe("Renamed");
  });

  it("finalize 403s a non-member; result stays draft", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await finalizeResult(jsonReq() as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
    expect((await new SortResultRepository(db).findById(resultId))!.status).toBe("draft");
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
Expected: FAIL — intruder PATCH returns 200, not 403.

- [ ] **Step 3: Inject the guard into `[id]/route.ts`**

In each of GET/PATCH/DELETE, add `import { requireApiResultAccess } from "@/server/dal/collection-access";`, capture the user, and inject the guard. Example GET (apply the same two-line injection to PATCH and DELETE, keeping their existing bodies/catches):

```ts
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const resultRepo = new SortResultRepository(db);
    const controller = new ResultController(resultRepo);
    const result = await controller.getResult(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
```

> `requireAuth()` already returns the user; reuse its result for `user.id`. Do **not** remove the `try/catch` — it preserves the controller-error → 500 / SyntaxError → 400 mapping (Architect F6).

- [ ] **Step 4: Inject the guard into `finalize/route.ts` and `supersede/route.ts`**

Same injection after `await requireAuth()` / inside the existing `try`. `supersede` keeps calling `controller.supersedeResult(params.id)` (still throws "not implemented" — unchanged, now behind the guard). For `finalize`, capture the user from `requireAuth()` to pass `user.id`.

- [ ] **Step 5: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.

```bash
git add src/app/api/sort-results/\[id\]/route.ts src/app/api/sort-results/\[id\]/finalize/route.ts src/app/api/sort-results/\[id\]/supersede/route.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): guard sort-results [id] core routes (collection+curator)"
```

---

### Task 3: Guard sort-results `items` + `shares` routes (+ belongs-to-parent for `[rid]` and `[sid]`)

**Files:**
- Modify: `src/app/api/sort-results/[id]/items/route.ts` (GET), `.../items/[rid]/route.ts` (GET/PATCH/DELETE), `.../items/[rid]/reset/route.ts` (POST), `.../shares/route.ts` (GET/POST), `.../shares/[sid]/route.ts` (GET/PATCH/DELETE)
- Test: extend `sort-results-authz.integration.test.ts`

**Interfaces:**
- Consumes: `requireApiResultAccess`, `SortResultItemRepository.findById(id)` → `{ id, sortResultId, ... }`, `SortResultShareRepository.findById(id)` → `{ id, sortResultId, ... }`.
- Produces: every handler guards on `requireApiResultAccess(db, params.id, userId)`. `items/[rid]` rejects `rid` whose `sortResultId !== params.id` (404); `shares/[sid]` rejects `sid` whose `sortResultId !== params.id` (404).

- [ ] **Step 1: Write the failing belongs-to-parent tests (real FK parents)**

Append (add imports for the items handlers + a shares handler):

```ts
import { GET as getItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { GET as listShares, POST as createShare } from "@/app/api/sort-results/[id]/shares/route";
import { DELETE as deleteShare } from "@/app/api/sort-results/[id]/shares/[sid]/route";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";

describe("sort-results children: guard + belongs-to-parent", () => {
  it("items/[rid] GET 404s a result-item that belongs to a DIFFERENT result", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    const item = await new ItemRepository(db).create({ collectionId }); // real FK parent
    const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "draft" });
    const otherItem = await new SortResultItemRepository(db).create({
      sortResultId: other.id, itemId: item.id, computedRank: 1, computedBucket: "top",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // Caller can access resultId, but asks for an item under `other.id`.
    const res = await getItem(new Request("http://localhost/x") as any, { params: { id: resultId, rid: otherItem.id } });
    expect(res.status).toBe(404);
  });

  it("items list GET 403s a non-member (IDOR)", async () => {
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const { GET } = await import("@/app/api/sort-results/[id]/items/route");
    const res = await GET(new Request("http://localhost/x") as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
  });

  it("shares list 403s a non-member (IDOR)", async () => {
    const { resultId } = await seedResult(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await listShares(new Request("http://localhost/x") as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
  });

  it("shares/[sid] DELETE 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "finalized" });
    const victimShare = await new SortResultShareRepository(db).create({ sortResultId: other.id });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // Caller owns `resultId`, tries to revoke a share under `other.id` via the path id.
    const res = await deleteShare(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: resultId, sid: victimShare.id } });
    expect(res.status).toBe(404);
  });
});
```

> Confirm `SortResultShareRepository.create` arg shape before writing (it takes `{ sortResultId, ... }`; pass whatever its signature requires). Confirm `SortResultItemRepository.create` field names.

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz`
Expected: FAIL — items/[rid] GET 200s on a mismatched parent; shares list 200s for an intruder; shares/[sid] DELETE 200s on a foreign share.

- [ ] **Step 3: Guard the items routes**

`items/route.ts` (GET list): inject `requireApiResultAccess(db, params.id, user.id)` after `requireAuth()`, inside the existing try.

`items/[rid]/route.ts` (GET/PATCH/DELETE): after the result guard, add the belongs-to-parent check. Example GET:

```ts
export async function GET(_request: NextRequest, { params }: { params: { id: string; rid: string } }) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, params.id, user.id);
    if (access instanceof NextResponse) return access;
    const item = await new SortResultItemRepository(db).findById(params.rid);
    if (!item || item.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
```

PATCH: same guard + belongs-to-parent, then the existing `controller.updateResultItem(params.rid, body)`.
DELETE: same guard + belongs-to-parent, then **keep the existing** `controller.deleteResultItem()` call (do NOT invent `repo.delete?.()`):

```ts
    // ponytail: controller.deleteResultItem() is a pre-existing no-op stub; this PR
    // only adds the authz guard. Real deletion tracked in the follow-up bead.
    await controller.deleteResultItem();
    return NextResponse.json({ message: "Item removed from result" });
```

`items/[rid]/reset/route.ts` (POST): inject the result guard + belongs-to-parent before `controller.resetResultItem(params.rid)`.

- [ ] **Step 4: Guard the shares routes (+ belongs-to-parent for `[sid]`)**

`shares/route.ts`: GET takes no params today — **add `{ params }: { params: { id: string } }`** and inject `requireApiResultAccess(db, params.id, user.id)`. POST: inject the same before `controller.createShare(params.id, body)`.

`shares/[sid]/route.ts` (GET/PATCH/DELETE): inject the result guard, then belongs-to-parent:

```ts
    const share = await new SortResultShareRepository(db).findById(params.sid);
    if (!share || share.sortResultId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```

then the existing `controller.getShare/updateShare/revokeShare(params.sid)` call. (Import `SortResultShareRepository`.)

- [ ] **Step 5: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.

```bash
git add src/app/api/sort-results/\[id\]/items src/app/api/sort-results/\[id\]/shares src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): guard sort-results items+shares; belongs-to-parent for [rid] and [sid]"
```

---

### Task 4: Fix + guard `POST /api/sort-results` (route through repo, allocate number)

**Files:**
- Modify: `src/app/api/sort-results/route.ts` (POST) — also delete now-dead `sortResultsTable` + `generateId` imports
- Test: extend `sort-results-authz.integration.test.ts`

**Interfaces:**
- Consumes: `requireApiCollectionAccess`, `SortResultRepository.create({ collectionId, curatorId, name, status })` (allocates `number`).
- Produces: POST 403s a non-member; on success returns a result with a **non-null `number`** and `curatorId === caller`.

- [ ] **Step 1: Write the failing test**

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
Expected: FAIL — intruder gets 201; `number` is null.

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

(This removes the raw insert, so `sortResultsTable` and `generateId` are no longer imported — confirm no other reference remains in the file.)

- [ ] **Step 4: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- sort-results-authz` → PASS.
Run: `npx vitest run src/features/sessions/SessionCompleteScreen` → green (screen still POSTs `{ sessionId, collectionId, name }`; route ignores `sessionId`).

```bash
git add src/app/api/sort-results/route.ts src/lib/db/sort-results-authz.integration.test.ts
git commit -m "fix(purses-axn): POST /api/sort-results routes through repo + collection guard (allocates number)"
```

---

### Task 4b: Gate `<SharePanel>` render on curator ownership (fixes Architect F2)

**Files:**
- Modify: `src/app/collections/[id]/results/[resultNumber]/page.tsx:145`
- Test: `src/app/collections/[id]/results/[resultNumber]/page.test.tsx`

**Interfaces:**
- Consumes: `result.curatorId`, `session.user.id` (both already in scope on the page).
- Produces: `<SharePanel>` renders only when the viewer is the result's curator.

- [ ] **Step 1: Write the failing test**

In `page.test.tsx`, add a case: a finalized result whose `curatorId` is someone else, viewed by the session user → the rendered output contains **no** SharePanel (assert on a SharePanel signifier, e.g. its "Create Link"/share heading text, absent). Mirror the existing finalize/page.test curator cases (`curatorId: "someone_else"`).

```ts
it("hides SharePanel for a non-curator viewing a finalized result", async () => {
  resultRepo.findByCollectionAndNumber.mockResolvedValue({
    id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "someone_else",
  });
  // session user is the test default (not "someone_else")
  const ui = await ResultDetailPage({ params: { id: "coll_01ABCDEF", resultNumber: "1" } });
  render(ui);
  expect(screen.queryByRole("heading", { name: /share/i })).toBeNull(); // adjust to SharePanel's actual signifier
});
```

> Read `SharePanel.tsx` for a stable, unique signifier (heading/button text) to assert on. If the page reads the session via a server helper, follow the existing `page.test.tsx` mock setup for `getSession`.

- [ ] **Step 2: Run to verify it fails** — SharePanel still renders (assertion finds the signifier).

- [ ] **Step 3: Gate the render** — change line 145:

```tsx
{result.status === "finalized" && result.curatorId === session.user.id && (
  <SharePanel resultId={result.id} initialShares={shares} />
)}
```

- [ ] **Step 4: Run page tests; commit**

Run: `npx vitest run src/app/collections/\[id\]/results/\[resultNumber\]/page` → PASS (new + existing).

```bash
git add src/app/collections/\[id\]/results/\[resultNumber\]/page.tsx src/app/collections/\[id\]/results/\[resultNumber\]/page.test.tsx
git commit -m "fix(purses-axn): render SharePanel only for the result's curator (no 403-on-click)"
```

---

### Task 5: Curator-scope the session-LIST GETs (purses-33u #1)

**Files:**
- Modify: `src/app/api/sessions/route.ts` (GET; drop unused `sessionsTable`/`eq`), `src/app/api/collections/[id]/sessions/route.ts` (GET)
- Test: `src/lib/db/session-list-authz.integration.test.ts` (create)

**Interfaces:**
- Consumes: `requireApiCollectionAccess`, `SessionRepository.findByCollectionAndCurator(collectionId, userId)`.
- Produces: both list GETs return only the caller's own sessions; non-member → 403.

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

- [ ] **Step 2: Run to verify it fails** — each list returns 2 sessions.

- [ ] **Step 3: Curator-scope the GETs**

`src/app/api/sessions/route.ts` GET — replace the raw select; remove now-unused `sessionsTable`/`eq` imports:

```ts
  const sessions = await new SessionRepository(db).findByCollectionAndCurator(collectionId, session.user.id);
  return NextResponse.json(sessions);
```

`src/app/api/collections/[id]/sessions/route.ts` GET — replace `listSessions`:

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
- Modify: `src/app/api/preferences/[collectionId]/route.ts` (GET), `src/app/api/collections/[id]/preferences/route.ts` (GET, DELETE)
- Test: `src/lib/db/preferences-authz.integration.test.ts` (create)

**Interfaces:**
- Consumes: `requireApiCollectionAccess`, existing `requireAuth()`.
- Produces: GET + DELETE 403 a non-member; 200 a member; DELETE still self-scopes to `user.id`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/preferences-authz.integration.test.ts` (auth mock provides both `getSession` + `requireAuth` from one spy, as in Task 1). Cases:
- flat GET 403s a non-member;
- nested GET 200s the owner;
- nested DELETE 403s a non-member;
- **nested DELETE 200s the owner and clears only the owner's prefs** (self-scope): seed a preference row for the owner via `CollectionPreferenceItemRepository`, DELETE as owner → 200, then assert the owner's prefs are gone (and, if a second member's prefs were seeded, that they remain).

```ts
// (header: same mock shape as sort-results-authz Task 1 — getSession + requireAuth from one spy)
import { GET as flatPrefs } from "@/app/api/preferences/[collectionId]/route";
import { GET as nestedPrefs, DELETE as clearPrefs } from "@/app/api/collections/[id]/preferences/route";
// ...seed collection (owner) in beforeEach...

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
it("nested DELETE 200s the owner (self-scoped clear)", async () => {
  mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  const res = await clearPrefs(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: collectionId } });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run to verify it fails** — non-member gets 200 (no gate).

- [ ] **Step 3: Add the gate to each handler**

After `const user = await requireAuth();` and `const db = getDb();`, insert (import `requireApiCollectionAccess`, `NextResponse`):

```ts
  const access = await requireApiCollectionAccess(db, /* params.collectionId | params.id */, user.id);
  if (access instanceof NextResponse) return access;
```

Flat route → `params.collectionId`; nested route (GET + DELETE) → `params.id`. Keep `requireAuth()` and the existing `try/catch` (minimal diff; getSession↔requireAuth unification deferred — out of authz scope).

- [ ] **Step 4: Run tests; commit**

Run: `RUN_DB_TESTS=1 npm run test:db -- preferences-authz` → PASS.

```bash
git add src/app/api/preferences src/app/api/collections/\[id\]/preferences/route.ts src/lib/db/preferences-authz.integration.test.ts
git commit -m "fix(purses-51h): add membership gate to preferences GET/DELETE routes"
```

---

### Task 7: Delete dead `DecisionController` (purses-33u #2)

**Files:** Delete `src/server/api/decisions.ts` (+ its test if any).

- [ ] **Step 1: Confirm dead** — `grep -rn "DecisionController\|CreateDecisionInput\|api/decisions" src/ e2e/` → only the definition (+ its own test). If any other importer exists, STOP — guard instead, and note it.
- [ ] **Step 2: Delete** — `git rm src/server/api/decisions.ts` (+ `decisions.test.ts` if present).
- [ ] **Step 3: Verify** — `npx tsc --noEmit 2>&1 | grep decisions || echo "no decisions errors"`; `npm run lint`.
- [ ] **Step 4: Commit** — `git commit -m "chore(purses-33u): delete dead DecisionController (live route guards its own writes)"`

---

### Task 8: Full gate run + follow-up beads + PR

- [ ] **Step 1: Full gates**

```bash
npm run build && npm run test:ci && npm run lint && npm run auth:verify && RUN_DB_TESTS=1 npm run test:db
```

Expected: all green; `tsc --noEmit` shows only the ~5 pre-existing errors (e2e specs + ScoringService.test.ts) — **no new** errors.

- [ ] **Step 2: Final adversarial-review of the IMPLEMENTATION** (multi-persona) → fix → re-review (per project workflow). Run vibe-security + adversarial-review Security on the diff.

- [ ] **Step 3: File follow-up beads**

```bash
bd create "Remove unused flat-vs-nested duplicate session-list + preferences routes (post-DAL g6o)" -t chore -p 3
bd create "Dead-but-reachable sort-result sub-routes (supersede throws, items DELETE no-op, shares GET stub) — delete or implement" -t chore -p 3
```

- [ ] **Step 4: Push branch; open PR** (after the review passes). E2E (Playwright) check SKIPS for API-only diffs — expected. PR body: summary + per-bead mapping + DB-test evidence.

---

## Self-Review (v2)

**Spec coverage:** axn (whole subtree) → Tasks 1–4 + 4b; 33u#1 → Task 5; 33u#2 → Task 7; 51h → Task 6. Tests un-mocked vs ephemeral PG → Tasks 1,2,3,4,5,6. ✅

**Review findings:** F1 (shares/[sid] IDOR) → Task 3 belongs-to-parent + test. F2 (SharePanel regression) → Task 4b + test. Fabricated `repo.delete?.()` → removed (Task 3 keeps existing no-op behind guard). `{res,userId}` envelope + dropped try/catch → replaced with inline-injection keeping try/catch (Tasks 2–4, 6). FK-violating test seed → real `ItemRepository.create` (Task 3). Coverage gaps → shares/items/reset 403 tests (Task 3) + prefs DELETE self-scope (Task 6). Dead imports → Task 4/5. ✅

**Placeholder scan:** Two `/* params.collectionId | params.id */` markers in Task 6 Step 3 are explicit per-route choices, not TBDs. Task 4b's SharePanel signifier and Task 3's `SortResultShareRepository.create` arg shape are flagged "read before writing" — real impl-time confirmations, not missing content. No TBD/TODO.

**Type consistency:** `requireApiResultAccess(db, resultId, userId): Promise<SortResult | NextResponse>` + `instanceof NextResponse` narrowing used uniformly (matches `requireApiCollectionAccess`/`authorizeSession`). `SortResultItem.sortResultId`, `SortResultShare.sortResultId`, `SessionRepository.findByCollectionAndCurator(collectionId, userId)`, `SortResultRepository.create({collectionId,curatorId,name,status})` all match real signatures. ✅

**Impl-time confirmations (read, don't guess):** `SortResultShareRepository.create` arg shape (Task 3 test); `SortResultItemRepository.create` field names; SharePanel's render signifier (Task 4b test); whether the results detail `page.test.tsx` mocks the session (Task 4b).
