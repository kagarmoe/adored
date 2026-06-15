# Short Collection Slugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw 26-char ULID in user-facing collection page URLs with a short, human-meaningful slug (`/collections/summer-bags/items/6`), while the API and all data access keep using the immutable ULID.

**Architecture:** Add a nullable, globally-unique `slug` column to `collections`, generated from the collection name (regenerated on rename) with a numeric dedupe suffix and a reserved-word guard. A single resolver (`resolveCollection`) accepts slug-or-ULID at the page boundary; everything downstream (DB queries, image/API URLs, client props) uses `collection.id`. Old ULID URLs keep working via the same resolver.

**Tech Stack:** Next.js App Router, Drizzle ORM over Postgres (Neon, stateless `neon-http`), Vitest (DB-gated tests behind `RUN_DB_TESTS=1`), Zod.

**Spec:** `docs/superpowers/specs/2026-06-15-short-collection-slugs-design.md` (read it; the §7 / Appendix audit table is the authoritative call-site checklist).

**The one rule (memorize):** Every `params.id` use downstream is **wrong** unless it is (a) passed to `requireCollectionAccess` to resolve the collection, or (b) a navigation `href`. Everything else — DB query, image/API URL, client-component prop used in `fetch`, redirect target, integrity comparison — **must use `collection.id`**.

---

## Task 1: Slug helper (pure functions, no DB)

**Files:**
- Create: `src/lib/collections/slug.ts`
- Test: `src/lib/collections/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/collections/slug.test.ts
import { describe, it, expect } from "vitest";
import { slugifyName, RESERVED_COLLECTION_SLUGS } from "./slug";

describe("slugifyName", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugifyName("Summer Bags")).toBe("summer-bags");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugifyName("  Kim's   Purses!! ")).toBe("kims-purses");
  });

  it("replaces underscores with hyphens (so a slug never contains _)", () => {
    expect(slugifyName("coll_xyz")).toBe("coll-xyz");
  });

  it("returns empty string for emoji/non-Latin-only names", () => {
    expect(slugifyName("👜👜")).toBe("");
  });

  it("truncates to 40 chars without a trailing hyphen", () => {
    const out = slugifyName("a".repeat(60));
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("-")).toBe(false);
  });

  it("reserves the static 'new' route", () => {
    expect(RESERVED_COLLECTION_SLUGS.has("new")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/collections/slug.test.ts`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/collections/slug.ts

/**
 * Slugs that would shadow a STATIC route sibling of /collections/[id].
 * Next.js resolves static routes before dynamic ones, so a collection slugged
 * "new" would be unreachable. RULE: when you add a static /collections/<x>
 * route, add "<x>" here.
 */
export const RESERVED_COLLECTION_SLUGS = new Set<string>(["new"]);

const MAX_SLUG_LENGTH = 40;

/** Lowercase, hyphenate, strip non-[a-z0-9-]. Returns "" if nothing survives. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/collections/slug.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/collections/slug.ts src/lib/collections/slug.test.ts
git commit -m "feat(purses-9fi): slugifyName + reserved-slug set"
```

---

## Task 2: Schema column + migration

**Files:**
- Modify: `src/lib/db/schema.ts:87-104` (collectionsTable)
- Create: `drizzle/0002_*.sql` (generated)

- [ ] **Step 1: Add the column + unique index**

In `src/lib/db/schema.ts`, change the `collectionsTable` definition so the columns include `slug` and the index callback adds a unique index. `uniqueIndex` is already imported.

```ts
export const collectionsTable = pgTable(
  "collections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    slug: text("slug"),
    description: text("description"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    ownerIdx: index("collections_owner_id_idx").on(table.ownerId),
    slugUnique: uniqueIndex("collections_slug_unique").on(table.slug),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/0002_<name>.sql` containing `ALTER TABLE "collections" ADD COLUMN "slug" text;` and `CREATE UNIQUE INDEX "collections_slug_unique" ON "collections" ("slug");`.

- [ ] **Step 3: Verify nullable + Postgres NULL-uniqueness assumption**

Confirm the generated SQL does **not** add `NOT NULL` and does **not** add a `DEFAULT`. Multiple NULL slugs must coexist (Postgres treats each NULL as distinct) so existing rows are valid before backfill.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(purses-9fi): add collections.slug column + unique index"
```

---

## Task 3: Domain type + repository interface

**Files:**
- Modify: `src/types/domain.ts:14-23` (Collection)
- Modify: `src/server/repositories/CollectionRepository.ts` (interface)

- [ ] **Step 1: Add `slug` to the Collection type**

In `src/types/domain.ts`, add `slug` to the `Collection` interface:

```ts
export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: CollectionStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

- [ ] **Step 2: Add `findBySlug` to the interface**

In `src/server/repositories/CollectionRepository.ts`, add the method to `ICollectionRepository`:

```ts
  findById(id: string): Promise<Collection | null>;
  findBySlug(slug: string): Promise<Collection | null>;
```

- [ ] **Step 3: Verify it fails to compile (drives Task 4)**

Run: `npx tsc --noEmit`
Expected: errors — `CollectionRepository` does not implement `findBySlug`; `mapToCollection` return missing `slug`. These are fixed in Task 4. (If other call sites error on missing `slug`, that is expected and resolved by Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/types/domain.ts src/server/repositories/CollectionRepository.ts
git commit -m "feat(purses-9fi): Collection.slug type + findBySlug interface"
```

---

## Task 4: Repository — slug generation, findBySlug, create/update, mapping

**Files:**
- Modify: `src/server/repositories/implementations/CollectionRepository.ts`
- Test: `src/lib/db/collection-slug.integration.test.ts` (create)

### 4a — DB integration test (write first)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/collection-slug.integration.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("collection slug generation (repo -> DB)", () => {
  const ownerId = "user_slug_test";

  function repo() {
    return new CollectionRepository(getTestDb().db);
  }

  async function seedOwner() {
    const { db } = getTestDb();
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      INSERT INTO "user" (id, name, email)
      VALUES (${ownerId}, 'Slug Tester', 'slug@test.dev')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("generates a slug from the name on create", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    expect(c.slug).toBe("summer-bags");
  });

  it("dedupes same-named collections globally", async () => {
    await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    const second = await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    expect(second.slug).toBe("summer-bags-2");
  });

  it("never assigns a reserved slug", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "New" });
    expect(c.slug).toBe("new-2");
  });

  it("falls back to a random slug for emoji-only names", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "👜👜" });
    expect(c.slug).toMatch(/^[a-z0-9]{6}$/);
  });

  it("regenerates the slug on rename and frees the old one", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Old Name" });
    const renamed = await repo().update(c.id, { name: "New Name" });
    expect(renamed.slug).toBe("new-name");
    expect(await repo().findBySlug("new-name")).not.toBeNull();
    expect(await repo().findBySlug("old-name")).toBeNull();
  });

  it("does not bump its own slug on a no-op rename", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Stable" });
    const again = await repo().update(c.id, { name: "Stable" });
    expect(again.slug).toBe("stable");
  });

  it("findBySlug excludes soft-deleted, but the slug stays reserved", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Gone" });
    await repo().softDelete(c.id);
    expect(await repo().findBySlug("gone")).toBeNull();
    const fresh = await repo().create({ id: generateId("coll"), ownerId, name: "Gone" });
    expect(fresh.slug).toBe("gone-2"); // deleted row still holds "gone" in the unique index
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- collection-slug`
Expected: FAIL — `findBySlug` not a function / `slug` undefined.

### 4b — Implementation

- [ ] **Step 3: Rewrite CollectionRepository**

Replace the full contents of `src/server/repositories/implementations/CollectionRepository.ts`:

```ts
import { eq, isNull, and, ne } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { collectionsTable } from "@/lib/db/schema";
import type { ICollectionRepository } from "../CollectionRepository";
import type { Collection } from "@/types";
import { slugifyName, RESERVED_COLLECTION_SLUGS } from "@/lib/collections/slug";

export class CollectionRepository implements ICollectionRepository {
  constructor(private db: Database) {}

  async create(data: {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
  }): Promise<Collection> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = await this.generateUniqueSlug(data.name);
      try {
        const [collection] = await this.db
          .insert(collectionsTable)
          .values({
            id: data.id,
            ownerId: data.ownerId,
            name: data.name,
            slug,
            description: data.description || null,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          })
          .returning();
        return this.mapToCollection(collection);
      } catch (error) {
        if (isSlugConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a collection slug");
  }

  async findById(id: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.id, id), isNull(collectionsTable.deletedAt)));
    return collection ? this.mapToCollection(collection) : null;
  }

  async findBySlug(slug: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.slug, slug), isNull(collectionsTable.deletedAt)));
    return collection ? this.mapToCollection(collection) : null;
  }

  async findByOwner(ownerId: string): Promise<Collection[]> {
    const collections = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.ownerId, ownerId), isNull(collectionsTable.deletedAt)));
    return collections.map((c) => this.mapToCollection(c));
  }

  async update(id: string, data: Partial<Collection>): Promise<Collection> {
    // Regenerate the slug when the name changes (excluding this row from dedupe).
    const renaming = data.name !== undefined;
    let newSlug = renaming ? await this.generateUniqueSlug(data.name!, id) : undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [collection] = await this.db
          .update(collectionsTable)
          .set({
            ...data,
            ...(newSlug !== undefined ? { slug: newSlug } : {}),
            updatedAt: new Date(),
          })
          .where(eq(collectionsTable.id, id))
          .returning();
        return this.mapToCollection(collection);
      } catch (error) {
        if (isSlugConflict(error) && renaming && attempt < 4) {
          // Lost the race; recompute against the now-current set and retry.
          newSlug = await this.generateUniqueSlug(data.name!, id);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Could not allocate a collection slug");
  }

  async softDelete(id: string): Promise<Collection> {
    const [collection] = await this.db
      .update(collectionsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(collectionsTable.id, id))
      .returning();
    return this.mapToCollection(collection);
  }

  /**
   * First free value among `base`, `base-2`, `base-3`, … where "free" means not
   * reserved and not present in ANY row (incl. soft-deleted, which still hold
   * their slug in the unique index) other than `excludeId` (the row being
   * renamed). Empty-slugifiable names get a random fallback base.
   */
  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugifyName(name) || randomSlug();
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (RESERVED_COLLECTION_SLUGS.has(candidate)) continue;
      const where = excludeId
        ? and(eq(collectionsTable.slug, candidate), ne(collectionsTable.id, excludeId))
        : eq(collectionsTable.slug, candidate);
      const [row] = await this.db
        .select({ id: collectionsTable.id })
        .from(collectionsTable)
        .where(where);
      if (!row) return candidate;
    }
  }

  private mapToCollection(row: any): Collection {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      slug: row.slug ?? null,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

/** Crockford-base32 (no I/L/O/U), lowercased, 6 chars. */
function randomSlug(): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function isSlugConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(slug) race — any other unique violation is a real bug
  // and must surface. Constraint name matches the Drizzle-generated index.
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" && message.includes("collections_slug_unique");
}
```

- [ ] **Step 4: Run the DB test to verify it passes**

Run: `npm run test:db -- collection-slug`
Expected: PASS (7 tests). (Requires Docker; the script boots an ephemeral Postgres.)

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/implementations/CollectionRepository.ts src/lib/db/collection-slug.integration.test.ts
git commit -m "feat(purses-9fi): generate + resolve collection slugs in repository"
```

---

## Task 5: Resolver — `resolveCollection` + `requireCollectionAccess`

**Files:**
- Modify: `src/lib/collection-access.ts`
- Test: append to `src/lib/db/collection-slug.integration.test.ts`

- [ ] **Step 1: Write the failing test (append to the slug integration test)**

Add inside the existing `describeDb` block. `resolveCollection` returns `null` on miss/no-access (the page-level `requireCollectionAccess` wraps it with a redirect, so we test the pure resolver here).

```ts
  it("resolveCollection finds by slug AND by ULID, and blocks non-members", async () => {
    const { resolveCollection } = await import("@/lib/collection-access");
    const { db } = getTestDb();
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Resolve Me" });

    expect((await resolveCollection(db, c.slug!, ownerId))?.id).toBe(c.id);
    expect((await resolveCollection(db, c.id, ownerId))?.id).toBe(c.id);
    expect(await resolveCollection(db, c.slug!, "user_stranger")).toBeNull();
  });

  it("un-mocked layer crossing: slug resolves, then items fetch by collection.id", async () => {
    const { resolveCollection } = await import("@/lib/collection-access");
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const { db } = getTestDb();
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "With Items" });
    const itemRepo = new ItemRepository(db);
    await itemRepo.create({ collectionId: c.id, name: "Thing" });

    const resolved = await resolveCollection(db, c.slug!, ownerId);
    const items = await itemRepo.findByCollection(resolved!.id);
    expect(items).toHaveLength(1); // guards the "slug into a FK query returns []" bug
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- collection-slug`
Expected: FAIL — `resolveCollection` is not exported.

- [ ] **Step 3: Implement the resolver and refactor the guard**

Replace `src/lib/collection-access.ts`:

```ts
import { redirect } from "next/navigation";
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

/**
 * Resolve a collection the user may access, accepting EITHER its public slug OR
 * its raw ULID id (so old ULID links keep working). Tries the slug column first,
 * then the id column — disambiguation is at the DB-column level, never string
 * parsing. Returns null if it doesn't exist or the user is neither member nor
 * owner. No redirects: callers decide.
 */
export async function resolveCollection(
  db: Database,
  slugOrId: string,
  userId: string,
): Promise<Collection | null> {
  const repo = new CollectionRepository(db);
  const collection = (await repo.findBySlug(slugOrId)) ?? (await repo.findById(slugOrId));
  if (!collection) return null;
  const membership = await new MembershipRepository(db).findByUser(userId, collection.id);
  if (!membership && collection.ownerId !== userId) return null;
  return collection;
}

/** Load a collection the current user may access (member or owner). Redirects to
 *  /collections if it doesn't exist or the user has no access. The single guard
 *  for every collection-scoped page — call it right after the session check.
 *  `slugOrId` is whatever is in the URL (a slug, or a legacy ULID). */
export async function requireCollectionAccess(
  db: Database,
  slugOrId: string,
  userId: string,
): Promise<Collection> {
  const collection = await resolveCollection(db, slugOrId, userId);
  if (!collection) redirect("/collections");
  return collection;
}
```

- [ ] **Step 4: Run the DB test to verify it passes**

Run: `npm run test:db -- collection-slug`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/collection-access.ts src/lib/db/collection-slug.integration.test.ts
git commit -m "feat(purses-9fi): resolveCollection accepts slug-or-ULID; guard delegates"
```

---

## Task 6: Production backfill script

**Files:**
- Create: `scripts/backfill-collection-slugs.ts`

Context: CI/test DBs start empty, so tests never need backfill (collections get slugs from `create()`). Only **production** has pre-existing rows. The column is nullable and the resolver falls back to id, so prod is correct before this runs — backfill only upgrades existing collections to pretty URLs. Run it once, manually, post-deploy. It is idempotent (`WHERE slug IS NULL`).

- [ ] **Step 1: Write the script**

```ts
// scripts/backfill-collection-slugs.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { isNull } from "drizzle-orm";
import postgres from "postgres";
import dotenv from "dotenv";
import { collectionsTable } from "@/lib/db/schema";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  const repo = new CollectionRepository(db as any);

  // Only rows missing a slug — safe to re-run; rows created post-deploy already
  // have slugs and are skipped.
  const rows = await db
    .select({ id: collectionsTable.id, name: collectionsTable.name })
    .from(collectionsTable)
    .where(isNull(collectionsTable.slug));

  console.log(`Backfilling ${rows.length} collections…`);
  for (const row of rows) {
    // update() regenerates the slug from the name with global dedupe.
    const updated = await repo.update(row.id, { name: row.name });
    console.log(`  ${row.id} -> ${updated.slug}`);
  }
  console.log("✅ Backfill complete");
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Add an npm script**

In `package.json` scripts, add:

```json
    "db:backfill-slugs": "node -r esbuild-register scripts/backfill-collection-slugs.ts",
```

- [ ] **Step 3: Dry-run compile check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-collection-slugs.ts package.json
git commit -m "feat(purses-9fi): one-shot prod backfill for collection slugs"
```

---

## Task 7: Page-layer audit — replace bucket-(c) `params.id` with `collection.id`

This is the largest task. Work the **Appendix table in the spec** file by file. For each file: `collection` is already returned by `requireCollectionAccess(db, params.id, userId)` — use it. Apply per-line:

- **Bucket (c)** — DB query arg, image/file URL arg, `collectionId={...}` prop on a component that `fetch`es, redirect target, integrity comparison → **`collection.id`**.
- **Bucket (b)** — navigation `href` / `collectionId` prop on a nav-only component → **`collection.slug ?? collection.id`**.

Do it in commits grouped by area (7a–7d). After each file, re-grep its line numbers (the table's numbers are spec-time). The three **BLOCKING** transforms below are not mechanical — apply them exactly.

**BLOCKING transform 1 — item lookups by collection (3 files):**
```ts
// src/app/collections/[id]/items/[itemNumber]/page.tsx
// src/app/collections/[id]/items/[itemNumber]/edit/page.tsx
// src/app/collections/[id]/items/[itemNumber]/photos/page.tsx
// BEFORE:
await itemRepo.findByCollectionAndNumber(params.id, number)
// AFTER:
await itemRepo.findByCollectionAndNumber(collection.id, number)
```

**BLOCKING transform 2 — result integrity guards (2 files):**
```ts
// src/app/collections/[id]/results/[resultId]/page.tsx
// src/app/collections/[id]/results/[resultId]/finalize/page.tsx
// BEFORE:
if (result.collectionId !== params.id) redirect(/* … */)
// AFTER:
if (result.collectionId !== collection.id) redirect(/* … */)
```

**BLOCKING transform 3 — hero/cover/gallery image URLs:**
```ts
// e.g. src/app/collections/[id]/items/[itemNumber]/page.tsx, items/page.tsx
// BEFORE:
getPhotoAssetUrlForPhoto(photo, params.id)
// AFTER:
getPhotoAssetUrlForPhoto(photo, collection.id)
```

### 7a — collection root + items pages

- [ ] **Step 1:** Edit per the table, files: `[id]/page.tsx`, `[id]/items/page.tsx`, `[id]/items/new/page.tsx`, `[id]/items/[itemNumber]/page.tsx`, `[id]/items/[itemNumber]/edit/page.tsx`, `[id]/items/[itemNumber]/photos/page.tsx`. Apply BLOCKING transforms 1 & 3. Change `findByCollection(params.id)` → `collection.id`; client-fetch props (`ItemForm`, `ItemEditForm`, `PhotoUpload`, `PhotoGallery`) → `collection.id`; nav hrefs and nav-only props (`ItemFilters`, `ItemCard`) → `collection.slug ?? collection.id`.
- [ ] **Step 2:** Run: `npx tsc --noEmit` — Expected: no errors in these files.
- [ ] **Step 3:** Run: `npm run build` — Expected: build succeeds.
- [ ] **Step 4: Commit** — `git commit -am "fix(purses-9fi): use collection.id for data, slug for nav (items pages)"`

### 7b — pool + members

- [ ] **Step 1:** Files: `[id]/pool/page.tsx` (`findPoolByCollection(params.id)`, `PoolUpload`/`PoolPhotoGrid` props → `collection.id`; breadcrumb → slug), `[id]/members/page.tsx` (`findByCollection(params.id)` → `collection.id`).
- [ ] **Step 2:** Run: `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Commit** — `git commit -am "fix(purses-9fi): collection.id for data on pool + members pages"`

### 7c — sort flow

- [ ] **Step 1:** Files: `[id]/sort/page.tsx`, `[id]/sort/new/page.tsx`, `[id]/sort/[sessionId]/page.tsx`, `[id]/sort/[sessionId]/compare/page.tsx`, `[id]/sort/[sessionId]/triage/page.tsx`. All `findByCollection(params.id)` → `collection.id`; `StartSessionForm` prop → `collection.id`; redirects feeding data → `collection.id`; nav hrefs → slug.
- [ ] **Step 2:** Run: `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Commit** — `git commit -am "fix(purses-9fi): collection.id for data on sort pages"`

### 7d — results flow (incl. BLOCKING guards)

- [ ] **Step 1:** Files: `[id]/results/page.tsx`, `[id]/results/[resultId]/page.tsx`, `[id]/results/[resultId]/finalize/page.tsx`. Apply BLOCKING transform 2. `findByCollection(params.id)` → `collection.id`; `FinalizeResultForm` prop → `collection.id`; `MostLovedHero`/`ItemCard` nav props → `collection.slug ?? collection.id`.
- [ ] **Step 2:** Run: `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Commit** — `git commit -am "fix(purses-9fi): collection.id for data + integrity guards on results pages"`

---

## Task 8: Canonical nav links — CollectionCard

**Files:**
- Modify: `src/features/collections/CollectionCard.tsx:13`

- [ ] **Step 1: Point the card at the slug**

```ts
// BEFORE:
href={`/collections/${collection.id}`}
// AFTER:
href={`/collections/${collection.slug ?? collection.id}`}
```

- [ ] **Step 2: Verify the card test still passes**

Run: `npx vitest run src/features/collections/CollectionCard.test.tsx`
Expected: PASS. (If the test fixture builds a `Collection` literal, add `slug: "..."` to it — TS will flag the missing field.)

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(purses-9fi): collection list links use canonical slug"
```

---

## Task 9: Rename redirect uses the new slug

**Files:**
- Modify: `src/features/collections/CollectionForm.tsx:38-43`

Context: `PATCH /api/collections/:id` already returns the updated collection (now including the regenerated `slug` from Task 4) — no API change needed. The form must use it.

- [ ] **Step 1: Use the returned slug in both redirects**

```ts
if (mode === "create") {
  const result = await apiPost<Collection>("/api/collections", validated);
  router.push(`/collections/${result.slug ?? result.id}`);
} else if (collection) {
  const result = await apiPatch<Collection>(`/api/collections/${collection.id}`, validated);
  router.push(`/collections/${result.slug ?? result.id}`);
}
```

(`apiPatch` returns the parsed JSON body; confirm its signature in `src/lib/api-client.ts` and type the result as `Collection`.)

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(purses-9fi): redirect to new slug after collection rename"
```

---

## Task 10: Verification sweep + full gates

- [ ] **Step 1: Prove no bucket-(c) leaks remain**

Run: `grep -rn "params.id" src/app/collections/\[id\]`
Expected: every remaining hit is either (a) the `requireCollectionAccess(db, params.id, …)` call, or (b) a navigation `href` / nav-only prop. **Zero** `params.id` feeding a DB query, image/file URL, client `fetch` prop, redirect-into-data, or integrity comparison. If any remain, fix and re-grep.

- [ ] **Step 2: Type + unit + lint**

Run: `npx tsc --noEmit && npm run test:ci && npm run lint`
Expected: all pass. (Watch for any `Collection` object literal in tests missing the new `slug` field — add `slug: null` or a value.)

- [ ] **Step 3: DB-gated tests**

Run: `npm run test:db`
Expected: all DB tests pass, including `collection-slug` (9 tests).

- [ ] **Step 4: Auth + build gates**

Run: `npm run build && npm run auth:verify`
Expected: both succeed.

- [ ] **Step 5: Manual smoke (preview or local)**

- Visit a collection via its **slug** URL → page + items + images render.
- Visit the same collection via its **legacy ULID** URL → still renders (resolver fallback).
- Rename the collection → address bar shows the **new** slug; old slug URL now redirects to `/collections`.
- Open a results detail page via slug → no redirect loop (BLOCKING guard #2).

- [ ] **Step 6: Screenshots for the PR**

Per repo rule (UI PRs include light + dark screenshots): capture the collection page and an item page at slug URLs, light and dark.

- [ ] **Step 7: Final commit (if any sweep fixes)**

```bash
git commit -am "chore(purses-9fi): verification sweep — no residual params.id data leaks"
```

---

## Done criteria (maps to the bead acceptance)

- Collection page URLs use the short slug; breadcrumbs/links are slug-based.
- Existing collections resolve via slug (after backfill) **and** legacy ULID URLs still resolve.
- No IDOR regression: `resolveCollection` returns null for non-members (covered by the DB test).
- All gates green: `build`, `test:ci`, `lint`, `auth:verify`, `test:db`.
