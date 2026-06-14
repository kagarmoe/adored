# Plan 3b — Pool → "Make an item" Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person tap-select pooled photos and "Make an item" — creating a nameless, catalog-numbered item from those photos, with the first selected as hero — all without leaving the pool.

**Architecture:** A guarded single-statement assignment (`PhotoRepository.assignPooledPhotosToItem`) does the IDOR-safe work; `ItemService.createItemFromPool` orchestrates create→assign; a `POST /pool/group` route exposes it with member-or-owner auth; `PoolPhotoGrid` becomes a stateful client component with selection + a sticky `PoolActionBar`. neon-http is stateless (no transactions), so order is create→assign and the guard's affected-row count is the safety net.

**Tech Stack:** Next.js App Router, TypeScript (strict), Drizzle ORM (neon-http), Vitest (node for logic, jsdom for components), Testing Library, Tailwind (luminous design tokens).

**Design spec:** [`2026-06-13-bulk-upload-plan-3b-grouping-design.md`](./2026-06-13-bulk-upload-plan-3b-grouping-design.md)

---

## File Structure

**New**
- `src/app/api/collections/[id]/pool/group/route.ts` — POST endpoint (+ `route.test.ts`)
- `src/features/pool/PoolActionBar.tsx` — sticky selection action bar (presentational)
- `src/features/pool/PoolPhotoGrid.test.tsx` — jsdom component test for selection + grouping

**Modified**
- `vitest.config.mts` — add `@vitejs/plugin-react` plugin (enables JSX/hooks in component tests)
- `package.json` — add jsdom + Testing Library dev dependencies
- `src/server/repositories/PhotoRepository.ts` — add `assignPooledPhotosToItem` to the interface
- `src/server/repositories/implementations/PhotoRepository.ts` — implement it
- `src/server/services/ItemService.ts` — add `createItemFromPool` + `PoolGroupError`; constructor gains a photo repo
- `src/lib/db/pool-schema.test.ts` — add `assignPooledPhotosToItem` DB tests
- `src/features/pool/PoolPhotoGrid.tsx` — selection state + action bar + grouping fetch
- `src/app/collections/[id]/pool/page.tsx` — no logic change; grid already owns interactivity (verify props)

---

## Task 1: Component-test tooling (jsdom + Testing Library)

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.mts`
- Test: `src/features/pool/_smoke.test.tsx` (temporary; deleted at end of task)

- [ ] **Step 1: Write the failing smoke test**

Create `src/features/pool/_smoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

function Hello() {
  return <p>hello pool</p>;
}

describe("jsdom component env", () => {
  it("renders a component into a DOM", () => {
    render(<Hello />);
    expect(screen.getByText("hello pool")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail (deps/plugin missing)**

Run: `npm run test:ci -- src/features/pool/_smoke.test.tsx`
Expected: FAIL — cannot resolve `@testing-library/react` / `@testing-library/jest-dom` (and JSX-in-test may error without the react plugin).

- [ ] **Step 3: Install the dev dependencies**

Run:
```bash
npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 4: Wire the React plugin into vitest**

Modify `vitest.config.mts` — add the import and `plugins`. Keep `environment: "node"` global (component files opt in per-file via the `// @vitest-environment jsdom` docblock):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 5: Run the smoke test to verify it passes**

Run: `npm run test:ci -- src/features/pool/_smoke.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Confirm the node suite still passes (no regression)**

Run: `npm run test:ci`
Expected: PASS — all existing tests green (the react plugin does not affect `.ts` node tests).

- [ ] **Step 7: Delete the smoke test and commit**

```bash
rm src/features/pool/_smoke.test.tsx
git add package.json package-lock.json vitest.config.mts
git commit -m "test: enable jsdom + Testing Library for component tests"
```

---

## Task 2: `assignPooledPhotosToItem` — guarded assign + hero in one statement

**Files:**
- Modify: `src/server/repositories/PhotoRepository.ts` (interface)
- Modify: `src/server/repositories/implementations/PhotoRepository.ts:1-69` (imports + method)
- Test: `src/lib/db/pool-schema.test.ts` (append; runs only under `RUN_DB_TESTS=1`)

- [ ] **Step 1: Write the failing DB tests**

Append inside the `describeDb("pool-ready schema", ...)` block in `src/lib/db/pool-schema.test.ts`, before its closing `});`:

```ts
it("assignPooledPhotosToItem assigns matching pooled photos and sets exactly one hero", async () => {
  const { db } = getTestDb();
  const { PhotoRepository } = await import(
    "@/server/repositories/implementations/PhotoRepository"
  );
  const repo = new PhotoRepository(db);
  await db.execute(
    sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_g1', ${collectionId}, 1, now(), now())`,
  );
  const p1 = await repo.create({ itemId: null, collectionId, blobKey: "g1", filename: "g1.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false });
  const p2 = await repo.create({ itemId: null, collectionId, blobKey: "g2", filename: "g2.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false });

  const count = await repo.assignPooledPhotosToItem(collectionId, [p1.id, p2.id], "item_g1", p1.id);
  expect(count).toBe(2);

  const assigned = await repo.findByItem("item_g1");
  expect(assigned).toHaveLength(2);
  expect(assigned.filter((p) => p.isHero).map((p) => p.id)).toEqual([p1.id]);
});

it("assignPooledPhotosToItem refuses a cross-collection photo (count short)", async () => {
  const { db } = getTestDb();
  const { PhotoRepository } = await import(
    "@/server/repositories/implementations/PhotoRepository"
  );
  const repo = new PhotoRepository(db);
  await db.execute(
    sql`INSERT INTO collections (id, owner_id, name, status, created_at, updated_at) VALUES ('col_g_other', ${userId}, 'Other', 'active', now(), now())`,
  );
  await db.execute(
    sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_g2', ${collectionId}, 1, now(), now())`,
  );
  const mine = await repo.create({ itemId: null, collectionId, blobKey: "m1", filename: "m1.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false });
  const theirs = await repo.create({ itemId: null, collectionId: "col_g_other", blobKey: "t1", filename: "t1.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false });

  const count = await repo.assignPooledPhotosToItem(collectionId, [mine.id, theirs.id], "item_g2", mine.id);
  expect(count).toBe(1); // only the in-collection pooled photo matched
});

it("assignPooledPhotosToItem refuses an already-assigned photo", async () => {
  const { db } = getTestDb();
  const { PhotoRepository } = await import(
    "@/server/repositories/implementations/PhotoRepository"
  );
  const repo = new PhotoRepository(db);
  await db.execute(
    sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_g3', ${collectionId}, 1, now(), now()), ('item_g3b', ${collectionId}, 2, now(), now())`,
  );
  const taken = await repo.create({ itemId: "item_g3b", collectionId, blobKey: "k1", filename: "k1.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: userId, isHero: false });
  const count = await repo.assignPooledPhotosToItem(collectionId, [taken.id], "item_g3", taken.id);
  expect(count).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `RUN_DB_TESTS=1 npm run test:ci -- src/lib/db/pool-schema.test.ts`
Expected: FAIL — `repo.assignPooledPhotosToItem is not a function`.
(Requires the local test DB: `bash e2e/fixtures/test-db.sh up`. Run DB test files one at a time — see the `db-test-parallel-deadlock` memory.)

- [ ] **Step 3: Add the method to the interface**

In `src/server/repositories/PhotoRepository.ts`, add to `interface IPhotoRepository` (after `clearHeroPhotos`):

```ts
  assignPooledPhotosToItem(
    collectionId: string,
    photoIds: string[],
    itemId: string,
    heroPhotoId: string,
  ): Promise<number>;
```

- [ ] **Step 4: Implement the guarded UPDATE**

In `src/server/repositories/implementations/PhotoRepository.ts`, extend the drizzle import on line 4 and add the method (e.g. after `setHero`):

```ts
import { eq, and, isNull, asc, inArray, sql } from "drizzle-orm";
```

```ts
  // Assigns the given pooled photos to an item and marks exactly one as hero,
  // in a single UPDATE. The WHERE clause is the IDOR / double-assign guard: it
  // matches only this collection's still-pooled, non-deleted rows, so a photo
  // from another collection, an already-grouped photo, or a deleted one can
  // never be captured. The caller compares the returned count to the requested
  // count and rejects on a mismatch (neon-http has no transaction to lean on).
  async assignPooledPhotosToItem(
    collectionId: string,
    photoIds: string[],
    itemId: string,
    heroPhotoId: string,
  ): Promise<number> {
    if (photoIds.length === 0) return 0;
    const now = new Date();
    const rows = await this.db
      .update(photosTable)
      .set({
        itemId,
        isHero: sql<boolean>`(${photosTable.id} = ${heroPhotoId})`,
        updatedAt: now,
      })
      .where(
        and(
          eq(photosTable.collectionId, collectionId),
          inArray(photosTable.id, photoIds),
          isNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .returning({ id: photosTable.id });
    return rows.length;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `RUN_DB_TESTS=1 npm run test:ci -- src/lib/db/pool-schema.test.ts`
Expected: PASS — all pool-schema tests green (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/PhotoRepository.ts src/server/repositories/implementations/PhotoRepository.ts src/lib/db/pool-schema.test.ts
git commit -m "feat(pool): guarded assignPooledPhotosToItem (assign + hero in one statement)"
```

---

## Task 3: `ItemService.createItemFromPool` + `PoolGroupError`

**Files:**
- Modify: `src/server/services/ItemService.ts`
- Test: `src/server/services/ItemService.test.ts` (new; node environment)

- [ ] **Step 1: Write the failing service tests**

Create `src/server/services/ItemService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ItemService, PoolGroupError } from "./ItemService";

function makeRepos(overrides: { assign?: number } = {}) {
  const itemRepo = {
    create: vi.fn().mockResolvedValue({ id: "item_new", collectionId: "c1", number: 7, name: null }),
    findById: vi.fn(),
    findByCollection: vi.fn(),
    findByCollectionAndNumber: vi.fn(),
    getNextCatalogNumber: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const photoRepo = {
    assignPooledPhotosToItem: vi.fn().mockResolvedValue(overrides.assign ?? 2),
  } as any;
  return { itemRepo: itemRepo as any, photoRepo };
}

describe("ItemService.createItemFromPool", () => {
  it("creates an item then assigns the photos, hero = first selected", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 2 });
    const service = new ItemService(itemRepo, photoRepo);

    const item = await service.createItemFromPool("c1", ["p1", "p2"]);

    expect(itemRepo.create).toHaveBeenCalledWith({ collectionId: "c1" });
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenCalledWith("c1", ["p1", "p2"], "item_new", "p1");
    expect(item.number).toBe(7);
  });

  it("dedupes photoIds before assigning (no false conflict)", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 2 });
    const service = new ItemService(itemRepo, photoRepo);
    await service.createItemFromPool("c1", ["p1", "p2", "p1"]);
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenCalledWith("c1", ["p1", "p2"], "item_new", "p1");
  });

  it("throws a conflict PoolGroupError when fewer rows assign than requested", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
  });

  it("rejects an empty selection without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", [])).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it("rejects more than 50 photos without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
    await expect(service.createItemFromPool("c1", ids)).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:ci -- src/server/services/ItemService.test.ts`
Expected: FAIL — `PoolGroupError` is not exported / `createItemFromPool` is not a function / constructor arity.

- [ ] **Step 3: Implement the method, error, and constructor change**

Replace the top of `src/server/services/ItemService.ts` (imports + class open + constructor) and add the method. The new constructor takes the photo repo as a second argument (ItemService has no other callers today, so this does not ripple):

```ts
import type { Item } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

const MAX_GROUP_PHOTOS = 50;

export class PoolGroupError extends Error {
  constructor(
    public readonly code: "empty" | "too_many" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PoolGroupError";
  }
}

export class ItemService {
  constructor(
    private repo: IItemRepository,
    private photoRepo: IPhotoRepository,
  ) {}

  // Make one item from selected pooled photos: create the (nameless,
  // catalog-numbered) item, then assign the photos with the first as hero.
  // Order is create -> assign because neon-http is stateless; the worst partial
  // failure is a harmless empty item, and the repo's affected-count guard makes
  // assignment all-or-reject (see assignPooledPhotosToItem).
  async createItemFromPool(collectionId: string, photoIds: string[]): Promise<Item> {
    const ids = [...new Set(photoIds)];
    if (ids.length === 0) {
      throw new PoolGroupError("empty", "Choose at least one photo to make an item.");
    }
    if (ids.length > MAX_GROUP_PHOTOS) {
      throw new PoolGroupError("too_many", `You can group up to ${MAX_GROUP_PHOTOS} photos at once.`);
    }
    const item = await this.repo.create({ collectionId });
    const assigned = await this.photoRepo.assignPooledPhotosToItem(
      collectionId,
      ids,
      item.id,
      ids[0],
    );
    if (assigned !== ids.length) {
      throw new PoolGroupError(
        "conflict",
        "Some of those photos aren't available to group anymore — try again.",
      );
    }
    return item;
  }
```

Leave the existing `createItem`, `getItem`, etc. methods unchanged below.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:ci -- src/server/services/ItemService.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ItemService.ts src/server/services/ItemService.test.ts
git commit -m "feat(pool): ItemService.createItemFromPool with PoolGroupError"
```

---

## Task 4: `POST /api/collections/[id]/pool/group` route

**Files:**
- Create: `src/app/api/collections/[id]/pool/group/route.ts`
- Test: `src/app/api/collections/[id]/pool/group/route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `src/app/api/collections/[id]/pool/group/route.test.ts` (mirrors the pool/photos test's hoisted-mock pattern):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, createItemFromPool } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
    createItemFromPool: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/server/services/ItemService", async () => {
  const actual = await vi.importActual<any>("@/server/services/ItemService");
  return {
    ...actual, // keep the real PoolGroupError class for instanceof mapping
    ItemService: vi.fn().mockImplementation(() => ({ createItemFromPool })),
  };
});

import { POST } from "./route";
import { PoolGroupError } from "@/server/services/ItemService";

function req(body: unknown) {
  return new Request("http://localhost/pool/group", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/collections/[id]/pool/group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    createItemFromPool.mockResolvedValue({ id: "item_new", number: 7 });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("400 when photoIds is missing or not a string array", async () => {
    const res = await POST(req({ photoIds: "nope" }), { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(createItemFromPool).not.toHaveBeenCalled();
  });

  it("201 with the new item number on success", async () => {
    const res = await POST(req({ photoIds: ["p1", "p2"] }), { params: { id: "c1" } });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ number: 7 });
    expect(createItemFromPool).toHaveBeenCalledWith("c1", ["p1", "p2"]);
  });

  it("409 when the service reports a grouping conflict", async () => {
    createItemFromPool.mockRejectedValue(new PoolGroupError("conflict", "gone"));
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(409);
  });

  it("allows the owner who has no membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:ci -- src/app/api/collections/[id]/pool/group/route.test.ts`
Expected: FAIL — `./route` has no `POST` export (module not found).

- [ ] **Step 3: Implement the route**

Create `src/app/api/collections/[id]/pool/group/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemService, PoolGroupError } from "@/server/services/ItemService";

// Groups selected pooled photos into one new (nameless, catalog-numbered) item.
// Auth mirrors the other pool routes: member-or-owner. The heavy lifting and the
// IDOR guard live in the service/repo; this handler validates input and maps
// PoolGroupError to a status code.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [collection, membership] = await Promise.all([
    new CollectionRepository(db).findById(params.id),
    new MembershipRepository(db).findByUser(session.user.id, params.id),
  ]);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!membership && collection.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const photoIds = (body as { photoIds?: unknown })?.photoIds;
  if (
    !Array.isArray(photoIds) ||
    photoIds.length === 0 ||
    !photoIds.every((x) => typeof x === "string")
  ) {
    return NextResponse.json({ error: "photoIds must be a non-empty string array" }, { status: 400 });
  }

  const service = new ItemService(new ItemRepository(db), new PhotoRepository(db));
  try {
    const item = await service.createItemFromPool(params.id, photoIds as string[]);
    return NextResponse.json({ number: item.number }, { status: 201 });
  } catch (error) {
    if (error instanceof PoolGroupError) {
      const status = error.code === "conflict" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:ci -- src/app/api/collections/[id]/pool/group/route.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/collections/[id]/pool/group/
git commit -m "feat(pool): POST /pool/group route to make an item from pooled photos"
```

---

## Task 5: Selection UI — `PoolPhotoGrid` + `PoolActionBar`

**Files:**
- Create: `src/features/pool/PoolActionBar.tsx`
- Modify: `src/features/pool/PoolPhotoGrid.tsx`
- Test: `src/features/pool/PoolPhotoGrid.test.tsx` (jsdom)
- Verify: `src/app/collections/[id]/pool/page.tsx` (already passes `collectionId` + `photos`)

- [ ] **Step 1: Write the failing component test**

Create `src/features/pool/PoolPhotoGrid.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolPhotoGrid } from "./PoolPhotoGrid";

const PHOTOS = [
  { id: "p1", filename: "one.jpg" },
  { id: "p2", filename: "two.jpg" },
  { id: "p3", filename: "three.jpg" },
];

function tile(id: string) {
  // each tile is a toggle button labelled by its (cleaned) filename
  return screen.getByRole("button", { name: new RegExp(id === "p1" ? "one" : id === "p2" ? "two" : "three") });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PoolPhotoGrid selection + grouping", () => {
  it("shows no action bar until a photo is selected", () => {
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);
    expect(screen.queryByRole("button", { name: /make an item/i })).not.toBeInTheDocument();
  });

  it("toggles selection and reflects the count; Clear deselects", async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("p1"));
    expect(tile("p1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    await user.click(tile("p2"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByRole("button", { name: /make an item/i })).not.toBeInTheDocument();
    expect(tile("p1")).toHaveAttribute("aria-pressed", "false");
  });

  it("on success: posts ordered ids, removes the tiles, clears, and confirms with the number", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("p2")); // first selected -> hero
    await user.click(tile("p1"));
    await user.click(screen.getByRole("button", { name: /make an item/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/pool/group",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ photoIds: ["p2", "p1"] }),
      }),
    ));
    await waitFor(() => expect(screen.getByText(/made #7/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /one/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("on failure: keeps the selection and shows an error", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "gone" }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("p1"));
    await user.click(screen.getByRole("button", { name: /make an item/i }));

    await waitFor(() => expect(screen.getByText(/couldn’t make that item|try again/i)).toBeInTheDocument());
    expect(tile("p1")).toHaveAttribute("aria-pressed", "true"); // still selected
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:ci -- src/features/pool/PoolPhotoGrid.test.tsx`
Expected: FAIL — current `PoolPhotoGrid` renders static `<img>` tiles with no toggle buttons / action bar.

- [ ] **Step 3: Create the presentational action bar**

Create `src/features/pool/PoolActionBar.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui";

export function PoolActionBar({
  count,
  busy,
  onMakeItem,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMakeItem: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface-raised/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur"
      role="region"
      aria-label="Grouping actions"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <span className="text-ink-soft" aria-live="polite">
          {count} selected
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onClear}>
            Clear
          </Button>
          <Button type="button" variant="primary" className="min-h-11" disabled={busy} onClick={onMakeItem}>
            {busy ? "Making…" : "Make an item"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `PoolPhotoGrid` as a stateful selectable grid**

Replace `src/features/pool/PoolPhotoGrid.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { getPoolPhotoAssetUrl } from "@/lib/photos";
import type { Photo } from "@/types";
import { PoolActionBar } from "./PoolActionBar";

type PoolPhoto = Pick<Photo, "id" | "filename">;

function alt(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

export function PoolPhotoGrid({
  collectionId,
  photos,
}: {
  collectionId: string;
  photos: PoolPhoto[];
}) {
  const [pool, setPool] = useState<PoolPhoto[]>(photos);
  const [selected, setSelected] = useState<string[]>([]); // selection order: [0] becomes hero
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clear = () => setSelected([]);

  const makeItem = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/pool/group`, {
        method: "POST",
        body: JSON.stringify({ photoIds: selected }),
      });
      if (!res.ok) {
        throw new Error("group failed");
      }
      const data = (await res.json()) as { number: number };
      const grouped = new Set(selected);
      setPool((prev) => prev.filter((p) => !grouped.has(p.id)));
      setSelected([]);
      setNotice(`Made #${data.number} — find it in your items.`);
    } catch {
      setError("We couldn’t make that item just now — your photos are safe; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-lg bg-success-soft px-4 py-2 text-success-deep" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-error-soft px-4 py-2 text-error-deep" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {pool.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(p.id)}
              className={`relative aspect-square min-h-11 overflow-hidden rounded-lg bg-surface-raised outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPoolPhotoAssetUrl(collectionId, p.id)}
                alt={alt(p.filename)}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-on-primary shadow"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* spacer so the fixed action bar never covers the last row */}
      {selected.length > 0 && <div aria-hidden className="h-20" />}

      <PoolActionBar count={selected.length} busy={busy} onMakeItem={makeItem} onClear={clear} />
    </div>
  );
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npm run test:ci -- src/features/pool/PoolPhotoGrid.test.tsx`
Expected: PASS — 4 tests green. If a token class name (`text-on-primary`, `bg-success-soft`, `bg-error-soft`, `ring-offset-surface`) does not exist in the design system, replace it with the nearest existing luminous token (grep `tailwind.config` / `globals.css`); class names do not affect the test assertions.

- [ ] **Step 6: Verify the pool page still wires correctly**

Confirm `src/app/collections/[id]/pool/page.tsx` passes `collectionId={params.id}` and `photos={pool.map(...)}` to `PoolPhotoGrid` (it does — no change needed). Run: `npm run build` and confirm the pool route compiles.
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/features/pool/PoolActionBar.tsx src/features/pool/PoolPhotoGrid.tsx src/features/pool/PoolPhotoGrid.test.tsx
git commit -m "feat(pool): tap-to-select pooled photos + Make an item action bar"
```

---

## Task 6: Gates, manual verification, screenshots, PR

**Files:** none (verification + delivery)

- [ ] **Step 1: Run the full gate suite**

Run each, confirm green:
```bash
npm run build
npm run test:ci
npm run lint
npm run auth:verify
```
Then the DB tests (serial — one file, see `db-test-parallel-deadlock`):
```bash
bash e2e/fixtures/test-db.sh up
RUN_DB_TESTS=1 npm run test:ci -- src/lib/db/pool-schema.test.ts
```
Expected: all green; `auth:verify` 5/5.

- [ ] **Step 2: Manual smoke (local dev)**

`npm run dev`, open a collection's **Add photos** page, upload 3+ photos, then: tap 2 to select (checkmarks + count appear), **Make an item** → the two tiles leave the pool, the `Made #N` confirmation shows, the third remains. Open the collection's items → item #N exists with the first-selected photo as hero. Tap a single photo → Make an item → a one-photo item. Confirm keyboard: Tab to a tile, Space toggles selection.

- [ ] **Step 3: Capture light + dark screenshots**

Pool page with a 2-photo selection + the action bar visible, in **both** themes (per `ui-prs-include-screenshots` memory). Save for the PR body.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/pool-grouping
gh pr create --title "feat(pool): make items from pooled photos (bulk upload 3b)" \
  --body "<summary + light/dark screenshots + gate output>"
```
Embed the screenshots (gh release-asset technique per the epic's prior PRs). In the PR body, note Plan 3b scope and that move/split/merge + "make each its own item" are a deferred follow-up bead.

- [ ] **Step 5: Code review before merge**

Run `superpowers:requesting-code-review` (or `pr-review-toolkit:code-reviewer`) on the branch — code review is a gate before merging a major feature. Address findings, then squash-merge.

---

## Self-review notes

- **Spec coverage:** selection model (Task 5), combine-only Make-an-item (Tasks 3–5), stay-in-pool confirmation (Task 5), first-selected hero (Tasks 2,3,5), guarded IDOR-safe assign (Task 2), member-or-owner auth (Task 4), deferred regroup (out of scope — noted in PR). All covered.
- **No transaction:** create→assign ordering + affected-count guard is the safety model (Task 2 method comment + design spec).
- **Hero in one statement:** Task 2 sets `is_hero = (id = heroPhotoId)` in the same UPDATE — no heroless window.
- **Follow-up bead** to file at session close: move/split/merge photos between items + "make each its own item" bulk action (P2, under epic purses-b1k).
