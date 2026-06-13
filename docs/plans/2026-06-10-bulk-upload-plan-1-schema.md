# Bulk Upload — Plan 1: Schema Migration Foundation (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relax/extend the `items` and `photos` schema so a photo can exist in a collection pool without an item, an item can exist without a name, and items carry a per-collection catalog number plus optional dimensions/weight/unit — with no behaviour change yet.

**Architecture:** Test-first. A **raw-SQL DB integration test** (schema-definition-independent, so it can be red *before* the schema changes) drives a single additive/relaxing Drizzle migration; then the type/repository changes get their own red→green DB tests. Existing data is disposable (no backfill — truncate so a `NOT NULL` add applies). Plan 1 of 4; upload-to-pool, catalog-number URLs, and grouping are later plans.

**Tech Stack:** Drizzle ORM + drizzle-kit, Postgres (Neon / local `app_test`), Vitest. DB tests run only under `RUN_DB_TESTS=1` with the local test DB up (`bash e2e/fixtures/test-db.sh up`), matching `src/lib/db/e2e-db.test.ts`.

**Spec:** `docs/plans/2026-06-10-bulk-upload-pool-design.md`

---

## File Structure

- `src/lib/db/pool-schema.test.ts` (new) — raw-SQL red→green tests for the migrated schema behaviour.
- `src/lib/db/schema.ts` — schema source of truth.
- `drizzle/0001_*.sql` — generated migration.
- `src/types/domain.ts` — `Item`, `Photo` types.
- `src/server/repositories/implementations/PhotoRepository.ts` — `create()` persists `collectionId`.
- `src/server/services/PhotoService.ts` + the photo-upload route — thread `collectionId`.

---

## Task 1: Write the failing schema-behaviour test (raw SQL — red first)

**Files:**
- Create: `src/lib/db/pool-schema.test.ts`

- [ ] **Step 1: Start the local test DB (un-migrated)**

Run: `bash e2e/fixtures/test-db.sh up`
Expected: container `pi-e2e-db` running with the **current** schema (no migration yet).

- [ ] **Step 2: Write the test (raw SQL, so it compiles without the new columns)**

Create `src/lib/db/pool-schema.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, BASELINE_USER } from "../../../e2e/fixtures/seed";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("pool-ready schema", () => {
  let userId: string;
  let collectionId: string;

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_test_pool";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Pool test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("accepts a pool photo: item_id NULL with a collection_id", async () => {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO photos (id, item_id, collection_id, blob_key, filename, mime_type, uploaded_by, is_hero, created_at, updated_at)
      VALUES ('photo_pool_1', NULL, ${collectionId}, 'k1', 'a.jpg', 'image/jpeg', ${userId}, false, now(), now())
    `);
    const rows = await db.execute(sql`SELECT collection_id, item_id FROM photos WHERE id = 'photo_pool_1'`);
    expect(rows[0]).toMatchObject({ collection_id: collectionId, item_id: null });
  });

  it("accepts a nameless item with a unit default", async () => {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO items (id, collection_id, number, created_at, updated_at)
      VALUES ('item_nameless_1', ${collectionId}, 1, now(), now())
    `);
    const rows = await db.execute(sql`SELECT name, unit, number FROM items WHERE id = 'item_nameless_1'`);
    expect(rows[0]).toMatchObject({ name: null, unit: "imperial", number: 1 });
  });

  it("enforces a unique catalog number per collection", async () => {
    const { db } = getTestDb();
    await db.execute(sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_n1', ${collectionId}, 7, now(), now())`);
    await expect(
      db.execute(sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_n2', ${collectionId}, 7, now(), now())`),
    ).rejects.toThrow();
  });

  it("stores dimensions and weight", async () => {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO items (id, collection_id, number, height, width, depth, weight, unit, created_at, updated_at)
      VALUES ('item_dim_1', ${collectionId}, 2, 10.5, 8, 3, 1.25, 'imperial', now(), now())
    `);
    const rows = await db.execute(sql`SELECT height, weight FROM items WHERE id = 'item_dim_1'`);
    expect(Number(rows[0].height)).toBe(10.5);
    expect(Number(rows[0].weight)).toBe(1.25);
  });
});
```

(Uses `BASELINE_USER` import to stay consistent with the existing DB test even though only `seedBaseline()` is needed; drop the import if lint flags it unused.)

- [ ] **Step 3: Run the test — confirm RED for the right reasons**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: FAIL — `column "collection_id" of relation "photos" does not exist`, `null value in column "name"… violates not-null`, and `column "number"… does not exist`. These are the schema gaps, not test bugs.

---

## Task 2: Schema changes + generate migration

**Files:**
- Modify: `src/lib/db/schema.ts` (itemsTable ~107-129, photosTable ~132-152)

- [ ] **Step 1: Edit `itemsTable`** — `name` nullable; add `number`, `height/width/depth/weight`, `unit`:

```ts
    name: text("name"),
    brand: text("brand"),
    style: text("style"),
    color: text("color"),
    material: text("material"),
    category: text("category"),
    number: integer("number"),
    height: numeric("height"),
    width: numeric("width"),
    depth: numeric("depth"),
    weight: numeric("weight"),
    unit: text("unit").default("imperial").notNull(),
    status: text("status"),
    notes: text("notes"),
```

Add `integer`, `numeric`, `uniqueIndex` to the `drizzle-orm/pg-core` import. Add the unique constraint in the items index callback:

```ts
    collectionNumberUnique: uniqueIndex("items_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
```

- [ ] **Step 2: Edit `photosTable`** — `itemId` nullable; add `collectionId`:

```ts
    itemId: text("item_id").references(() => itemsTable.id),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
```

Add to the photos index callback:

```ts
    collectionIdx: index("photos_collection_id_idx").on(table.collectionId),
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: `drizzle/0001_*.sql` created.

- [ ] **Step 4: Review the SQL**

Run: `cat drizzle/0001_*.sql`
Expected: `items.name DROP NOT NULL`; add `number/height/width/depth/weight/unit`; `photos.item_id DROP NOT NULL`; `photos ADD COLUMN collection_id text NOT NULL`; the two new indexes. (The `collection_id NOT NULL` add has no default — Task 3 truncates first.)

---

## Task 3: Apply migration to the test DB → green

**Files:** none (DB)

- [ ] **Step 1: Recreate the test DB with the new migration applied**

Run: `bash e2e/fixtures/test-db.sh reset`
Expected: container recreated; `0000` + `0001` applied (empty tables, so the `NOT NULL` add succeeds with no rows).

- [ ] **Step 2: Run the Task 1 test — confirm GREEN**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: PASS — all four behaviours hold.

- [ ] **Step 3: Commit the test + schema + migration together**

```bash
git add src/lib/db/pool-schema.test.ts src/lib/db/schema.ts drizzle/
git commit -m "feat(db): pool-ready schema (TDD) — nullable item name + photo itemId, photo collectionId, item catalog number + dimensions/weight/unit"
```

---

## Task 4: Update domain types (compiler is the test)

**Files:**
- Modify: `src/types/domain.ts` (`Item` ~72-86, `Photo` ~89-101)

- [ ] **Step 1: `Item`** — `name: string | null`; add `number: number | null`, `height/width/depth/weight: string | null` (drizzle `numeric` → `string`), `unit: string`.
- [ ] **Step 2: `Photo`** — `itemId: string | null`; add `collectionId: string`.

(Exact field blocks are in the spec's Schema section; mirror the column names.)

- [ ] **Step 3: Run build — RED**

Run: `npm run build`
Expected: FAIL only in `PhotoRepository.create` (missing `collectionId`) — Task 5 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/types/domain.ts
git commit -m "feat(types): Item.name + Photo.itemId nullable; add collectionId, number, dimensions"
```

---

## Task 5: Persist collectionId (red→green at the repository layer)

**Files:**
- Modify: `src/lib/db/pool-schema.test.ts` (add a repo-level test)
- Modify: `src/server/repositories/implementations/PhotoRepository.ts`
- Modify: `src/server/services/PhotoService.ts` + the photo-upload route

- [ ] **Step 1: Add a failing repo test** to `pool-schema.test.ts` (inside the `describeDb` block):

```ts
  it("PhotoRepository persists a pool photo via the typed layer", async () => {
    const { db } = getTestDb();
    const { PhotoRepository } = await import("@/server/repositories/implementations/PhotoRepository");
    const repo = new PhotoRepository(db);
    const photo = await repo.create({
      itemId: null,
      collectionId,
      blobKey: "k2",
      filename: "b.jpg",
      mimeType: "image/jpeg",
      fileSize: 123,
      uploadedBy: userId,
      isHero: false,
    });
    expect(photo).toMatchObject({ itemId: null, collectionId });
  });
```

- [ ] **Step 2: Run — RED**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: this test fails (PhotoRepository doesn't accept/persist `collectionId` yet) — and `npm run build` fails for the same reason.

- [ ] **Step 3: Make it pass** — in `PhotoRepository.create`, add `collectionId: data.collectionId` to the `.values({…})` and `collectionId: row.collectionId` to `mapToPhoto`. Then thread `collectionId` through `PhotoService.addPhoto` and its caller (the `/collections/[id]/items/[itemId]/photos` route passes `params.id`). Find callers: `grep -rn "addPhoto" src`.

- [ ] **Step 4: Run — GREEN + build clean**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts && npm run build`
Expected: PASS; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/pool-schema.test.ts src/server src/app
git commit -m "feat(photos): PhotoRepository/Service persist collectionId (pool photos)"
```

---

## Task 6: Apply to Neon branches + full gate + PR

- [ ] **Step 1: Migrate the dev Neon branch** — truncate then migrate (disposable data):

```bash
npx dotenv -e .env.local -- node -e "const p=require('postgres');const s=p(process.env.DATABASE_URL,{max:1});s\`TRUNCATE photos, items CASCADE\`.then(()=>s.end()).then(()=>console.log('truncated'))"
npm run db:migrate
```

- [ ] **Step 2: Migrate the prod (`main`) Neon branch** — point `DATABASE_URL` at it, repeat truncate + `npm run db:migrate`. Both branches must be migrated before the schema is "live" (see `neon-db-setup`).

- [ ] **Step 3: Full gate**

Run: `npm run test:ci && npm run lint && npm run build`
Expected: all exit 0. (The DB tests are `RUN_DB_TESTS`-gated, so `test:ci` skips them — they were already run green in Tasks 3 and 5.)

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/bulk-upload
gh pr create --title "feat(db): pool-ready schema foundation, TDD (bulk upload 1/4)" --body "Implements docs/plans/2026-06-10-bulk-upload-plan-1-schema.md. Test-first (raw-SQL DB integration red→green) migration: nullable item name + photo itemId, photo collectionId, item catalog number + dimensions/weight/unit. No behaviour change. Part of purses-b1k."
```

---

## Self-Review

- **TDD:** the migration itself is driven red→green by a raw-SQL DB test that runs *before* the schema exists (Task 1 RED → Task 3 GREEN); the repository change is driven red→green at the typed layer (Task 5). Build acts as the type-level test (Task 4).
- **Spec coverage (schema slice):** name nullable, dimensions/weight/unit, `photos.itemId` nullable + `collectionId`, `items.number` + `UNIQUE(collectionId, number)`, ULID PKs untouched, disposable reset, both Neon branches + e2e — all covered. Upload/URLs/grouping are Plans 2–4.
- **Placeholder scan:** test, schema, and repo edits are concrete; the `grep "addPhoto"` is a discovery step for call sites that vary by repo state.
- **Type consistency:** `collectionId: string`, `itemId: string | null`, `numeric → string | null` used identically across the test, `Photo`, `PhotoRepository`, and `PhotoService`.
