# Epic C · PR1 — Item Dispositions + "Not Yet" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curator-scoped `item_dispositions` data model and ship the first consumer — the "Not yet" (defer) affordance in triage with end-of-pass resurfacing — while keeping disposed items out of the triage queue, pairwise compare, and results.

**Architecture:** A new `item_dispositions` table (`disposition ∈ {set_aside, deferred}`, `UNIQUE(item_id, curator_id)`) governs triage/pairing *queue* eligibility. Reversal = row delete. The `disposed ⟺ untriaged` invariant is enforced at the boundary (write 409s if a preference row exists; recording a triage decision deletes any disposition for that item), which is what keeps results correct with no scoring change. Pairing exclusion is **load-bearing** (the live `selectNextPair` scores no-preference items as 0 and would otherwise pair a disposed item).

**Tech Stack:** Next.js App Router (Server Components + client islands), Drizzle ORM + Neon Postgres, NextAuth JWT, Zod, Vitest (jsdom unit + `RUN_DB_TESTS` node integration), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-24-gentle-affordances-design.md` (PR1 row in §9).

## Global Constraints

- **Authorities (in order):** `TONE.md` (first-order) → `PRODUCT.md` → `DESIGN.md`. Copy speaks from the person's side; forbidden words: discard, trash, skip, abandon, "X remaining", streak/deadline.
- **`curatorId` is ALWAYS derived server-side from the session — never from the request body.**
- **`disposed ⟺ untriaged` invariant** must hold (write 409 on existing preference; triage decision clears disposition).
- **No new design tokens.** Patient-waiting chip = cool-blue fill + **`ink`** text (never `ink-soft` on a cool-blue chip — fails light-theme AA). `ink-soft` only on surface/ground.
- **A11y WCAG 2.1 AA**, both themes; ≥44px tap targets (`h-11`); focus-visible; `prefers-reduced-motion` honored; colour never the sole signal (label + icon).
- **Tests must run in CI:** node DB-integration tests live under `src/lib/db/` behind `RUN_DB_TESTS=1` (the `db-tests` job runs them); e2e under `e2e/**`. At least one un-mocked layer-crossing test.
- **Migrations:** edit `src/lib/db/schema.ts`, run `npm run db:generate`, then hand-verify the generated `drizzle/NNNN_*.sql` + `meta` are correct and reversible.
- **No `ON DELETE CASCADE`** (repo convention) — dispositions must be deleted before their parent item/collection/curator in the three purge services.

---

### Task 1: Schema, domain types, migration for `item_dispositions`

**Files:**
- Modify: `src/lib/db/schema.ts` (add `itemDispositionsTable` after `preferencesTable`)
- Modify: `src/types/domain.ts` (add `Disposition`, `ItemDisposition`)
- Create: `drizzle/0008_<tag>.sql` + `drizzle/meta/0008_snapshot.json` + journal entry (via `npm run db:generate`)

**Interfaces:**
- Produces: `itemDispositionsTable` (drizzle table); `type Disposition = "set_aside" | "deferred"`; `interface ItemDisposition { id; collectionId; curatorId; itemId; disposition: Disposition; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Add the table to `src/lib/db/schema.ts`** (after `preferencesTable`, ~L278):

```ts
// ===== ITEM DISPOSITIONS (curator-scoped: 'set_aside' = Not Mine, 'deferred' = Not Yet) =====
export const itemDispositionsTable = pgTable(
  "item_dispositions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    itemId: text("item_id")
      .notNull()
      .references(() => itemsTable.id),
    disposition: text("disposition").notNull(), // 'set_aside' | 'deferred'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    itemCuratorUnique: uniqueIndex("item_dispositions_item_curator_unique").on(
      table.itemId,
      table.curatorId,
    ),
    collectionCuratorIdx: index("item_dispositions_collection_curator_idx").on(
      table.collectionId,
      table.curatorId,
    ),
  }),
);
```

- [ ] **Step 2: Add domain types to `src/types/domain.ts`** (after the `CollectionPreferenceItem` block):

```ts
// ===== ITEM DISPOSITION =====
export type Disposition = "set_aside" | "deferred";

export interface ItemDisposition {
  id: string;
  collectionId: string;
  curatorId: string;
  itemId: string;
  disposition: Disposition;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0008_<tag>.sql` containing `CREATE TABLE "item_dispositions"` + the unique index + the secondary index; `drizzle/meta/_journal.json` gains an `idx: 8` entry; `drizzle/meta/0008_snapshot.json` created.

- [ ] **Step 4: Hand-verify the generated SQL** is `CREATE TABLE` + `CREATE UNIQUE INDEX item_dispositions_item_curator_unique` + `CREATE INDEX item_dispositions_collection_curator_idx`, FKs to `collections`/`user`/`items`, no `CASCADE`. (CREATE TABLE on an empty table needs no `CONCURRENTLY`.) Confirm it matches Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/types/domain.ts drizzle/
git commit -m "feat(db): item_dispositions table + domain types (Epic C PR1)"
```

---

### Task 2: `ItemDispositionRepository` (interface + implementation) + DB-integration tests

**Files:**
- Create: `src/server/repositories/ItemDispositionRepository.ts` (interface)
- Create: `src/server/repositories/implementations/ItemDispositionRepository.ts` (impl)
- Test: `src/lib/db/item-dispositions.integration.test.ts`

**Interfaces:**
- Consumes: `itemDispositionsTable`, `ItemDisposition`, `Disposition` (Task 1); `generateId("disp")`.
- Produces:
  ```ts
  interface IItemDispositionRepository {
    upsert(data: { collectionId: string; curatorId: string; itemId: string; disposition: Disposition }): Promise<ItemDisposition>;
    findByCollectionAndCurator(collectionId: string, curatorId: string): Promise<ItemDisposition[]>;
    findByItem(itemId: string, curatorId: string): Promise<ItemDisposition | null>;
    delete(itemId: string, curatorId: string): Promise<number>; // rows removed (idempotent)
    deleteByItem(itemId: string): Promise<number>;        // purge-only
    deleteByCollection(collectionId: string): Promise<void>; // purge-only
  }
  // impl also exposes (not in interface, account-deletion only): deleteByCurator(curatorId: string): Promise<void>
  ```

- [ ] **Step 1: Write the failing DB-integration test** `src/lib/db/item-dispositions.integration.test.ts`. Header mirrors `collection-purge.integration.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("ItemDispositionRepository", () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  it("upserts a disposition and reads it back by collection+curator", async () => {
    const { db } = getTestDb();
    const { collectionId, curatorId, itemIds } = await seedBaseline(db);
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId: itemIds[0], disposition: "deferred" });
    const all = await repo.findByCollectionAndCurator(collectionId, curatorId);
    expect(all).toHaveLength(1);
    expect(all[0].disposition).toBe("deferred");
  });

  it("upsert switches disposition in place (one row, UNIQUE(item,curator))", async () => {
    const { db } = getTestDb();
    const { collectionId, curatorId, itemIds } = await seedBaseline(db);
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId: itemIds[0], disposition: "deferred" });
    await repo.upsert({ collectionId, curatorId, itemId: itemIds[0], disposition: "set_aside" });
    const all = await repo.findByCollectionAndCurator(collectionId, curatorId);
    expect(all).toHaveLength(1);
    expect(all[0].disposition).toBe("set_aside");
  });

  it("delete is idempotent: removes the row, returns 0 when absent", async () => {
    const { db } = getTestDb();
    const { collectionId, curatorId, itemIds } = await seedBaseline(db);
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId: itemIds[0], disposition: "deferred" });
    expect(await repo.delete(itemIds[0], curatorId)).toBe(1);
    expect(await repo.delete(itemIds[0], curatorId)).toBe(0);
    expect(await repo.findByCollectionAndCurator(collectionId, curatorId)).toHaveLength(0);
  });
});
```

> NOTE: confirm `seedBaseline`'s exact return shape in `e2e/fixtures/seed.ts` before relying on `{ collectionId, curatorId, itemIds }`; adapt destructuring to the real signature (the `e2e-seed-no-owner-membership` memory: baseline seeds insert collections directly — seed a membership if `findByCollectionAndCurator`/auth needs one).

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/item-dispositions.integration.test.ts`
Expected: FAIL — module `ItemDispositionRepository` not found.

- [ ] **Step 3: Write the interface** `src/server/repositories/ItemDispositionRepository.ts` (the `IItemDispositionRepository` block above, importing `ItemDisposition`, `Disposition` from `@/types`).

- [ ] **Step 4: Write the implementation** `src/server/repositories/implementations/ItemDispositionRepository.ts`:

```ts
import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { itemDispositionsTable } from "@/lib/db/schema";
import type { IItemDispositionRepository } from "../ItemDispositionRepository";
import type { ItemDisposition, Disposition } from "@/types";
import { generateId } from "@/lib/id";

export class ItemDispositionRepository implements IItemDispositionRepository {
  constructor(private db: Database) {}

  async upsert(data: {
    collectionId: string;
    curatorId: string;
    itemId: string;
    disposition: Disposition;
  }): Promise<ItemDisposition> {
    const [row] = await this.db
      .insert(itemDispositionsTable)
      .values({
        id: generateId("disp"),
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        itemId: data.itemId,
        disposition: data.disposition,
      })
      .onConflictDoUpdate({
        target: [itemDispositionsTable.itemId, itemDispositionsTable.curatorId],
        set: { disposition: data.disposition, updatedAt: new Date() },
      })
      .returning();
    return this.map(row);
  }

  async findByCollectionAndCurator(collectionId: string, curatorId: string): Promise<ItemDisposition[]> {
    const rows = await this.db
      .select()
      .from(itemDispositionsTable)
      .where(and(eq(itemDispositionsTable.collectionId, collectionId), eq(itemDispositionsTable.curatorId, curatorId)));
    return rows.map((r) => this.map(r));
  }

  async findByItem(itemId: string, curatorId: string): Promise<ItemDisposition | null> {
    const [row] = await this.db
      .select()
      .from(itemDispositionsTable)
      .where(and(eq(itemDispositionsTable.itemId, itemId), eq(itemDispositionsTable.curatorId, curatorId)));
    return row ? this.map(row) : null;
  }

  async delete(itemId: string, curatorId: string): Promise<number> {
    const deleted = await this.db
      .delete(itemDispositionsTable)
      .where(and(eq(itemDispositionsTable.itemId, itemId), eq(itemDispositionsTable.curatorId, curatorId)))
      .returning({ id: itemDispositionsTable.id });
    return deleted.length;
  }

  async deleteByItem(itemId: string): Promise<number> {
    const deleted = await this.db
      .delete(itemDispositionsTable)
      .where(eq(itemDispositionsTable.itemId, itemId))
      .returning({ id: itemDispositionsTable.id });
    return deleted.length;
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(itemDispositionsTable).where(eq(itemDispositionsTable.collectionId, collectionId));
  }

  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(itemDispositionsTable).where(eq(itemDispositionsTable.curatorId, curatorId));
  }

  private map(row: typeof itemDispositionsTable.$inferSelect): ItemDisposition {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      itemId: row.itemId,
      disposition: row.disposition as Disposition,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/item-dispositions.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/ItemDispositionRepository.ts src/server/repositories/implementations/ItemDispositionRepository.ts src/lib/db/item-dispositions.integration.test.ts
git commit -m "feat(repo): ItemDispositionRepository with upsert/delete + DB tests (Epic C PR1)"
```

---

### Task 3: `DispositionController` + `disposed ⟺ untriaged` 409 invariant

**Files:**
- Create: `src/server/api/dispositions.ts`
- Test: extend `src/lib/db/item-dispositions.integration.test.ts` (add a `DispositionController` describe block, OR a sibling `dispositions-controller.integration.test.ts`)

**Interfaces:**
- Consumes: `ItemDispositionRepository` (Task 2); `CollectionPreferenceItemRepository.findByItem(itemId, curatorId)` (existing — returns the preference or null).
- Produces:
  ```ts
  class DispositionController {
    static fromDb(db): DispositionController;
    setDisposition(collectionId, curatorId, data: unknown): Promise<ItemDisposition>; // Zod {itemId, disposition}; throws PreferenceExistsError if a pref row exists
    listDispositions(collectionId, curatorId, disposition?: Disposition): Promise<ItemDisposition[]>;
    bringBack(itemId, curatorId): Promise<number>;
  }
  class PreferenceExistsError extends Error {} // mapped to 409 by the route
  ```

- [ ] **Step 1: Write the failing test** — POST disposition on an already-triaged item throws `PreferenceExistsError`:

```ts
it("setDisposition rejects an item that already has a preference (disposed<=>untriaged)", async () => {
  const { db } = getTestDb();
  const { collectionId, curatorId, itemIds } = await seedBaseline(db);
  // create a preference row for itemIds[0] (simulate it was triaged)
  await new CollectionPreferenceItemRepository(db).create({
    collectionId, curatorId, itemId: itemIds[0],
    score: 0.5, confidence: 0, rankBucket: "medium", comparisonCount: 1,
  });
  const ctrl = DispositionController.fromDb(db);
  await expect(
    ctrl.setDisposition(collectionId, curatorId, { itemId: itemIds[0], disposition: "deferred" }),
  ).rejects.toBeInstanceOf(PreferenceExistsError);
});
```

- [ ] **Step 2: Run to verify it fails** — `RUN_DB_TESTS=1 npx vitest run src/lib/db/item-dispositions.integration.test.ts` → FAIL (controller missing).

- [ ] **Step 3: Implement `src/server/api/dispositions.ts`:**

```ts
import { z } from "zod";
import type { Database } from "@/lib/db";
import type { ItemDisposition, Disposition } from "@/types";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const SetDispositionSchema = z.object({
  itemId: z.string().min(1),
  disposition: z.enum(["set_aside", "deferred"]),
});

export class PreferenceExistsError extends Error {
  constructor() {
    super("Item already has a preference; cannot set a disposition on a triaged item");
    this.name = "PreferenceExistsError";
  }
}

export class DispositionController {
  constructor(
    private dispositionRepo: ItemDispositionRepository,
    private preferenceRepo: CollectionPreferenceItemRepository,
  ) {}

  static fromDb(db: Database): DispositionController {
    return new DispositionController(
      new ItemDispositionRepository(db),
      new CollectionPreferenceItemRepository(db),
    );
  }

  async setDisposition(collectionId: string, curatorId: string, data: unknown): Promise<ItemDisposition> {
    const { itemId, disposition } = SetDispositionSchema.parse(data);
    // disposed <=> untriaged: refuse if the item already has a preference for this curator.
    const existing = await this.preferenceRepo.findByItem(itemId, curatorId);
    if (existing) throw new PreferenceExistsError();
    return this.dispositionRepo.upsert({ collectionId, curatorId, itemId, disposition });
  }

  async listDispositions(collectionId: string, curatorId: string, disposition?: Disposition): Promise<ItemDisposition[]> {
    const all = await this.dispositionRepo.findByCollectionAndCurator(collectionId, curatorId);
    return disposition ? all.filter((d) => d.disposition === disposition) : all;
  }

  async bringBack(itemId: string, curatorId: string): Promise<number> {
    return this.dispositionRepo.delete(itemId, curatorId);
  }
}
```

- [ ] **Step 4: Run to verify pass** — `RUN_DB_TESTS=1 npx vitest run src/lib/db/item-dispositions.integration.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/dispositions.ts src/lib/db/item-dispositions.integration.test.ts
git commit -m "feat(api): DispositionController + disposed<=>untriaged 409 invariant (Epic C PR1)"
```

---

### Task 4: Wire disposition erasure into the three purge/deletion services

**Files:**
- Modify: `src/server/services/ItemPurgeService.ts` (add `deleteByItem` inside the tx, before `ItemRepository.hardDelete`)
- Modify: `src/server/services/CollectionPurgeService.ts` (add `deleteByCollection` inside the tx, before `ItemRepository.hardDeleteByCollection`)
- Modify: `src/server/services/AccountDeletionService.ts` (add `deleteByCurator` inside the curator-private tx)
- Test: extend the existing `src/lib/db/*purge*` / account-deletion integration tests to assert a disposition row is removed.

**Interfaces:**
- Consumes: `ItemDispositionRepository.deleteByItem/deleteByCollection/deleteByCurator` (Task 2). All called with the **tx-bound** db (`new ItemDispositionRepository(tx)`).

- [ ] **Step 1: Write the failing test** — an item with a disposition can be purged and the disposition is gone. Add to the item-purge integration test:

```ts
it("purging an item also removes its disposition row (no FK violation)", async () => {
  const { db } = getTestDb();
  const { collectionId, curatorId, ownerId, itemIds } = await seedBaseline(db);
  await new ItemDispositionRepository(db).upsert({ collectionId, curatorId, itemId: itemIds[0], disposition: "set_aside" });
  const item = await new ItemRepository(db).findById(itemIds[0]);
  await ItemPurgeService.fromDb(db).purge(item!, ownerId);
  const remaining = await new ItemDispositionRepository(db).findByItem(itemIds[0], curatorId);
  expect(remaining).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — without the wiring, the purge throws a 23503 FK violation (the disposition still references the item). Expected: FAIL.

- [ ] **Step 3: Add the deletes.** In `ItemPurgeService.purge()` transaction, before `new ItemRepository(tx).hardDelete(item.id)`:

```ts
await new ItemDispositionRepository(tx).deleteByItem(item.id);
```

In `CollectionPurgeService.purge()` transaction, before `new ItemRepository(tx).hardDeleteByCollection(...)`:

```ts
await new ItemDispositionRepository(tx).deleteByCollection(collection.id);
```

In `AccountDeletionService` Phase-2 curator-private tx (alongside `CollectionPreferenceItemRepository(tx).deleteByCurator(userId)`):

```ts
await new ItemDispositionRepository(tx).deleteByCurator(userId);
```

Add the import `import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";` to each service.

- [ ] **Step 4: Run to verify pass** — `RUN_DB_TESTS=1 npx vitest run src/lib/db/` (item-purge, collection-purge, account-deletion). Expected: PASS, incl. the new disposition assertions. Add the same "disposition gone after" assertion to the collection-purge and account-deletion tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ItemPurgeService.ts src/server/services/CollectionPurgeService.ts src/server/services/AccountDeletionService.ts src/lib/db/
git commit -m "fix(erasure): delete item_dispositions on item/collection/account purge (Epic C PR1)"
```

---

### Task 5: Dispositions API routes + IDOR + authz-enumeration registration

**Files:**
- Create: `src/app/api/collections/[id]/dispositions/route.ts` (POST, GET)
- Create: `src/app/api/collections/[id]/dispositions/[itemId]/route.ts` (DELETE)
- Test: `src/lib/db/dispositions-routes.integration.test.ts`
- Verify: `src/lib/db/route-authz-enumeration.integration.test.ts` (the new routes auto-register as stranger cases; assert the floor moved)

**Interfaces:**
- Consumes: `getSession` (`@/lib/auth`), `getDb`, `requireApiItemCapability(db, itemId, userId, "preferences:write")` and `requireApiCollectionAccess(db, collectionId, userId)` (`@/server/dal/collection-access`), `DispositionController`, `PreferenceExistsError`.
- Auth contract: POST/DELETE resolve the **item** (item-capability) AND assert `item.collectionId === params.id` (404 on mismatch — no cross-collection oracle). GET uses collection access. `curatorId = session.user.id` always.

- [ ] **Step 1: Write the failing route integration test** `src/lib/db/dispositions-routes.integration.test.ts` (header like the other route integration tests; mock `@/lib/auth` + `@/lib/db`). Cases:
  1. curator A POSTs `{itemId: A-item, disposition: "deferred"}` to `/collections/A-coll/dispositions` → 201, row exists.
  2. POST with an `itemId` from collection B (curator A has no access) → **404**, no row written.
  3. POST on an item that already has a preference → **409**.
  4. **Co-member IDOR:** curator B (a member of A's shared collection) DELETEs `/collections/A-coll/dispositions/[A-item]` where the disposition belongs to A → the delete must not remove A's row (B deletes by `(itemId, curatorId=B)`, so A's row is untouched; assert A's row still present). Also B cannot read A's dispositions via GET (GET scoped to B's curatorId → empty).
  5. DELETE on an absent disposition → **200** (idempotent).

```ts
it("POST disposition with an item from another collection → 404, no row", async () => {
  // seed two collections; curatorA is member of collA only; itemB belongs to collB
  // POST /api/collections/{collA}/dispositions {itemId: itemB, disposition:'deferred'} as curatorA
  const res = await POST(req(`/api/collections/${collA}/dispositions`, { itemId: itemB, disposition: "deferred" }), { params: { id: collA } });
  expect(res.status).toBe(404);
  // assert no item_dispositions row for itemB
});
```

- [ ] **Step 2: Run to verify it fails** — routes missing → FAIL.

- [ ] **Step 3: Implement POST/GET** `src/app/api/collections/[id]/dispositions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability, requireApiCollectionAccess } from "@/server/dal/collection-access";
import { DispositionController, PreferenceExistsError } from "@/server/api/dispositions";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { itemId?: string; disposition?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const db = getDb();
  // Resolve the item, authorize on its collection, then assert it agrees with the URL.
  const item = await requireApiItemCapability(db, body.itemId, session.user.id, "preferences:write");
  if (item instanceof NextResponse) return item;
  if (item.collectionId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await DispositionController.fromDb(db).setDisposition(params.id, session.user.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PreferenceExistsError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Failed to set disposition" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, params.id, session.user.id);
  if (access instanceof NextResponse) return access;
  const disp = new URL(req.url).searchParams.get("disposition") ?? undefined;
  const list = await DispositionController.fromDb(db).listDispositions(
    params.id, session.user.id, disp === "set_aside" || disp === "deferred" ? disp : undefined,
  );
  return NextResponse.json(list);
}
```

- [ ] **Step 4: Implement DELETE** `src/app/api/collections/[id]/dispositions/[itemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiItemCapability } from "@/server/dal/collection-access";
import { DispositionController } from "@/server/api/dispositions";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const item = await requireApiItemCapability(db, params.itemId, session.user.id, "preferences:write");
  if (item instanceof NextResponse) return item;
  if (item.collectionId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await DispositionController.fromDb(db).bringBack(params.itemId, session.user.id); // idempotent → 200
  return NextResponse.json({ message: "Brought back" });
}
```

- [ ] **Step 5: Run to verify pass** — `RUN_DB_TESTS=1 npx vitest run src/lib/db/dispositions-routes.integration.test.ts` → PASS (all cases incl. co-member IDOR + cross-collection 404 + 409 + idempotent DELETE).

- [ ] **Step 6: Confirm the authz-enumeration backstop now covers the new routes**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/route-authz-enumeration.integration.test.ts`
Expected: PASS, with the discovered-route count increased (the 3 new route+method cases are picked up and a stranger gets 403/404). If the enumeration uses an explicit allowlist rather than auto-discovery, add the new routes there.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/collections/[id]/dispositions/ src/lib/db/dispositions-routes.integration.test.ts
git commit -m "feat(api): /collections/[id]/dispositions routes with IDOR guards (Epic C PR1)"
```

---

### Task 6: `selectTriageItem` pure function + exhaustive unit tests

**Files:**
- Create: `src/lib/triage-selection.ts`
- Test: `src/lib/triage-selection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function selectTriageItem(
    items: Item[],
    preferenceItemIds: Set<string>,
    dispositionByItemId: Map<string, Disposition>,
  ): { item: Item | null; showingDeferred: boolean };
  ```

- [ ] **Step 1: Write the failing unit test** `src/lib/triage-selection.test.ts` (jsdom default ok; pure fn):

```ts
import { describe, it, expect } from "vitest";
import { selectTriageItem } from "./triage-selection";
import type { Item, Disposition } from "@/types";

const item = (id: string): Item => ({ id, collectionId: "c", name: id, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null });

describe("selectTriageItem", () => {
  it("returns the first untriaged, non-disposed item", () => {
    const r = selectTriageItem([item("a"), item("b")], new Set(), new Map());
    expect(r.item?.id).toBe("a"); expect(r.showingDeferred).toBe(false);
  });
  it("excludes set_aside items entirely", () => {
    const r = selectTriageItem([item("a"), item("b")], new Set(), new Map([["a", "set_aside" as Disposition]]));
    expect(r.item?.id).toBe("b");
  });
  it("defers 'deferred' items to the end (after active are gone)", () => {
    const disp = new Map<string, Disposition>([["a", "deferred"]]);
    expect(selectTriageItem([item("a"), item("b")], new Set(), disp).item?.id).toBe("b"); // b active first
    expect(selectTriageItem([item("a"), item("b")], new Set(["b"]), disp).item?.id).toBe("a"); // b triaged → a resurfaces
  });
  it("sets showingDeferred when only deferred remain", () => {
    const disp = new Map<string, Disposition>([["a", "deferred"]]);
    const r = selectTriageItem([item("a")], new Set(), disp);
    expect(r.item?.id).toBe("a"); expect(r.showingDeferred).toBe(true);
  });
  it("returns null when everything is triaged or set aside", () => {
    expect(selectTriageItem([item("a")], new Set(["a"]), new Map()).item).toBeNull();
    expect(selectTriageItem([item("a")], new Set(), new Map([["a", "set_aside" as Disposition]])).item).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/triage-selection.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/triage-selection.ts`:

```ts
import type { Item, Disposition } from "@/types";

export function selectTriageItem(
  items: Item[],
  preferenceItemIds: Set<string>,
  dispositionByItemId: Map<string, Disposition>,
): { item: Item | null; showingDeferred: boolean } {
  const untriaged = items.filter((i) => !preferenceItemIds.has(i.id));
  const candidates = untriaged.filter((i) => dispositionByItemId.get(i.id) !== "set_aside");
  const active = candidates.filter((i) => dispositionByItemId.get(i.id) !== "deferred");
  const deferred = candidates.filter((i) => dispositionByItemId.get(i.id) === "deferred");
  const item = active[0] ?? deferred[0] ?? null;
  return { item, showingDeferred: active.length === 0 && deferred.length > 0 };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/triage-selection.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/triage-selection.ts src/lib/triage-selection.test.ts
git commit -m "feat: selectTriageItem queue-eligibility pure function (Epic C PR1)"
```

---

### Task 7: Pairing exclusion (load-bearing) + clear-disposition-on-triage

**Files:**
- Modify: `src/lib/pairwise-selection.ts` (accept + apply `dispositionByItemId`)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` (fetch dispositions; pass to `selectNextPair`)
- Modify: `src/app/api/sessions/[id]/decisions/route.ts` (after a `triage` decision, delete any disposition for that item)
- Test: `src/lib/pairwise-selection.test.ts` (unit); extend `src/lib/db/dispositions-routes.integration.test.ts` or a sort-flow integration test for clear-on-triage + disposed-never-paired.

**Interfaces:**
- Modifies `selectNextPair` signature to `selectNextPair({ preferences, items, decidedPairs, dispositionByItemId })` where `dispositionByItemId: Map<string, Disposition>` (default empty Map for back-compat callers/tests).
- Consumes: `DispositionController.fromDb(db).listDispositions(collectionId, curatorId)`, `ItemDispositionRepository.delete`.

- [ ] **Step 1: Write the failing unit test** in `src/lib/pairwise-selection.test.ts`: a `set_aside` or `deferred` item is never returned as `itemA`/`itemB`.

```ts
it("excludes disposed items from pairing candidates", () => {
  const items = [item("a"), item("b"), item("c")];
  const prefs = items.map((i, n) => pref(i.id, 0.9 - n * 0.1)); // a>b>c
  const disp = new Map<string, Disposition>([["b", "deferred"], ["c", "set_aside"]]);
  const pair = selectNextPair({ preferences: prefs, items, decidedPairs: new Set(), dispositionByItemId: disp });
  // only 'a' is eligible → no valid pair
  expect(pair).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/pairwise-selection.test.ts` → FAIL (current signature ignores dispositions).

- [ ] **Step 3: Implement the filter** in `src/lib/pairwise-selection.ts` — add `dispositionByItemId?: Map<string, Disposition>` to `SelectionOptions`; at the top of `selectNextPair`, filter:

```ts
const disposed = options.dispositionByItemId ?? new Map();
const eligible = options.items.filter((i) => !disposed.has(i.id));
// ...use `eligible` instead of `items` for the sort.
```

- [ ] **Step 4: Wire `compare/page.tsx`** — add `DispositionController.fromDb(db).listDispositions(collection.id, session.user.id)` to the `Promise.all`, build `const dispositionByItemId = new Map(dispositions.map(d => [d.itemId, d.disposition]))`, and pass it into `selectNextPair({ ..., dispositionByItemId })`.

- [ ] **Step 5: Clear disposition on triage decision** — in `decisions/route.ts`, after the successful insert + `recalculatePreferences`, when `body.type === "triage"`:

```ts
if (body.type === "triage") {
  const itemId = (body.decision as { itemId?: string }).itemId;
  if (itemId) await new ItemDispositionRepository(db).delete(itemId, session.user.id);
}
```

(Import `ItemDispositionRepository`.)

- [ ] **Step 6: Write/extend the integration test** — a deferred item, once triaged, has its disposition cleared; and a disposed item never appears as a pair via the real compare path data (un-mocked repo → pg). Run `RUN_DB_TESTS=1 npx vitest run src/lib/db/` and `npx vitest run src/lib/pairwise-selection.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pairwise-selection.ts "src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx" "src/app/api/sessions/[id]/decisions/route.ts" src/lib/pairwise-selection.test.ts src/lib/db/
git commit -m "fix(sort): exclude disposed items from pairing; clear disposition on triage (Epic C PR1)"
```

---

### Task 8: Triage UI — `selectTriageItem` wiring, "Not yet" affordance, patient-waiting skin, ceiling-free progress, copy fix, contrast gate, DESIGN.md

**Files:**
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` (use `selectTriageItem`; fetch dispositions; ceiling-free progress; person-side copy; patient-waiting skin; render the defer control)
- Create: `src/features/sorting/DeferControl.tsx` (client island: "Not yet" → POST disposition → `router.refresh()`)
- Modify: `src/lib/design/contrast.test.ts` (add `[t.inkSoft, t.surface, 4.5, "ink-soft on surface"]`)
- Modify: `DESIGN.md` (add a "Patient waiting (Not yet)" entry — via `/sync-docs` at PR time)
- Test: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.test.tsx` (extend) + `src/features/sorting/DeferControl.test.tsx`

**Interfaces:**
- Consumes: `selectTriageItem` (Task 6), `DispositionController.listDispositions` (Task 3), the POST disposition route (Task 5).
- `DeferControl` props: `{ collectionId: string; itemId: string }` (POSTs `{itemId, disposition:"deferred"}` to `/api/collections/${collectionId}/dispositions`, then `router.refresh()`; in-flight guard like `AbandonSessionButton`; ≥44px; ghost variant).

- [ ] **Step 1: Write the failing component test** `src/features/sorting/DeferControl.test.tsx` (jsdom; mock `fetch` + `next/navigation` `useRouter`): clicking "Not yet" POSTs to the dispositions endpoint with `disposition:"deferred"` and calls `router.refresh()`.

```ts
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { DeferControl } from "./DeferControl";

describe("DeferControl", () => {
  beforeEach(() => { refresh.mockClear(); global.fetch = vi.fn().mockResolvedValue({ ok: true }); });
  it("defers the item and refreshes", async () => {
    render(<DeferControl collectionId="c1" itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/dispositions", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toEqual({ itemId: "i1", disposition: "deferred" });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/features/sorting/DeferControl.test.tsx` → FAIL.

- [ ] **Step 3: Implement `DeferControl.tsx`** (mirror `AbandonSessionButton` in-flight guard; ghost `Button`; copy "Not yet", sub via `aria-label`/title "I'll come back to this"). Single tap (no confirm — it's reversible and low-stakes).

- [ ] **Step 4: Wire `triage/page.tsx`** — add `DispositionController.fromDb(db).listDispositions(collection.id, session.user.id)` to the `Promise.all`; build `dispositionByItemId`; replace the inline `items.find(...)` with `const { item, showingDeferred } = selectTriageItem(items, new Set(preferences.map(p => p.itemId)), dispositionByItemId);`. Render `<DeferControl collectionId={collection.slug ?? collection.id} itemId={item.id} />` in the quiet secondary sub-row below `DecisionControls` (a divider/spacing per §7). When `showingDeferred`, render the patient-waiting headline ("Ready when you are") with the cool-blue + `ink` chip. Replace the `{triaged} of {totalItems}` + filling bar with a ceiling-free cue (e.g. show only items-decided-so-far, no total, no bar — or remove). Fix H1/subhead machine-side copy ("How do you feel about this one?").

- [ ] **Step 5: Add the contrast gate row** to `src/lib/design/contrast.test.ts` `pairings()`:

```ts
[t.inkSoft, t.surface, 4.5, "ink-soft on surface (quiet secondary copy)"],
```

(The patient-waiting chip uses `ink` on a cool blue — already gated by the existing `ink on accent-*` rows.)

- [ ] **Step 6: Run unit/component + contrast** — `npx vitest run src/features/sorting/DeferControl.test.tsx src/lib/design/contrast.test.ts "src/app/collections/[id]/sort/[sessionNumber]/triage/page.test.tsx"` → PASS. Update the triage page test for the new copy + defer control + ceiling-free progress.

- [ ] **Step 7: Add the DESIGN.md "Patient waiting (Not yet)" entry** (token usage only: cool-blue benign chip + `ink` text + `--ease-gentle` crossfade + reduced-motion instant) — run `/sync-docs` to place it correctly.

- [ ] **Step 8: Commit**

```bash
git add "src/app/collections/[id]/sort/[sessionNumber]/triage/" src/features/sorting/DeferControl.tsx src/features/sorting/DeferControl.test.tsx src/lib/design/contrast.test.ts DESIGN.md
git commit -m "feat(triage): Not-yet defer affordance + patient-waiting + ceiling-free progress (Epic C PR1)"
```

---

### Task 9: e2e — Not-Yet defer flow + screenshots

**Files:**
- Create: `e2e/not-yet-defer.spec.ts` (tablet + phone + desktop projects via the existing fixtures auth; image interceptors per the `e2e-image-file-glob-querystring` memory)
- Uses: `e2e/fixtures` (auth.setup, seedSortScenario)

- [ ] **Step 1: Write the e2e** — seed a sort scenario; open triage; tap "Not yet" on the focused item; assert it leaves the flow (the next item shows); triage the remaining non-deferred items; assert the deferred item resurfaces with the "Ready when you are" treatment; (defer flow only — Not-Mine/undo are PR2). Assert no count "X of Y" backlog string is present.

- [ ] **Step 2: Run e2e** — `npx playwright test e2e/not-yet-defer.spec.ts` (all 3 viewport projects). Expected: PASS. Capture light+dark screenshots for the PR via the `pr-screenshots` skill.

- [ ] **Step 3: Commit**

```bash
git add e2e/not-yet-defer.spec.ts
git commit -m "test(e2e): Not-yet defer flow across tablet/phone/desktop (Epic C PR1)"
```

---

## Final gate (before opening PR1)

- [ ] `npm run build` — passes
- [ ] `npm run test:ci` — passes (unit + jsdom)
- [ ] `npm run lint` — passes (watch unused imports — `gates-miss-unused-imports-and-types` memory)
- [ ] `npm run auth:verify` — passes
- [ ] `RUN_DB_TESTS=1 npm run test:db` — passes (disposition repo/controller/routes/erasure + authz-enumeration floor moved)
- [ ] `npx playwright test e2e/not-yet-defer.spec.ts` — passes 3 viewports
- [ ] `/sync-docs` (DESIGN.md patient-waiting; API.md dispositions routes) + `/graphify --update`
- [ ] Whole-branch `adversarial-review` (lenses: postgres-review, security/IDOR, system-design, UX, a11y, QA) → fold → re-verify
- [ ] Light+dark screenshots embedded in the PR body (`pr-screenshots`)

## Self-review (spec coverage)

- §4.1 table + UNIQUE → Task 1. §4.3 three erasure vectors → Task 4. §5.1 selectTriageItem + ceiling-free progress → Tasks 6, 8. §3.1/§11 pairing exclusion → Task 7. §2 `disposed⟺untriaged` (409 + clear-on-triage) → Tasks 3, 7. §6 routes + IDOR (item-capability + collection-match 404 + co-member 403) → Task 5. §5.3 patient-waiting + AA fix + DESIGN.md → Task 8. §8 tests (idempotency no-ops, negative assertions, co-member IDOR, enumeration registration) → Tasks 2, 5, 7. e2e → Task 9. **Not in PR1 (correct):** "Not mine" set-aside + inline undo + durable list (PR2); pause (PR3); session undo (PR4).
