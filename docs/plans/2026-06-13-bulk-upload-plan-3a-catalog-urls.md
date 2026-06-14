# Bulk Upload — Plan 3a: Catalog Numbers + Item-URL Refactor + Nameless Items

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every item carry a per-collection catalog **number**, address items by that number in the human-facing URL (`/collections/{id}/items/3`), and let items exist **without a name** (`Item.name` becomes nullable) while still displaying and linking correctly — the groundwork that makes Plan 3b's nameless, grouped items reachable.

**Architecture:** Three moves. (1) **Allocation** lives inside `ItemRepository.create`: when no `number` is supplied it takes `MAX(number)+1` for the collection and retries on the `UNIQUE(collection_id, number)` violation (neon-http has no long transactions), so every create path — the existing "Add Item" form today, Plan 3b's grouping tomorrow — gets a number with no caller changes. (2) **Only the page route tree** (`src/app/collections/[id]/items/[itemId]/…`) moves to `[itemNumber]` and resolves items by `(collectionId, number)`; the **API route tree** (`src/app/api/…/items/[itemId]/…`) stays keyed by the stable ULID, because photo sub-resources are addressed programmatically off `photo.itemId` (a ULID) and never need a number. (3) **`Item.name` flips to `string | null`**, and a single `itemDisplayName()` helper supplies the fallback (`#<number>`) at every display + breadcrumb site, fixing the latent `item.name.charAt(0)` null-crashes.

**Tech Stack:** Next.js App Router, Drizzle (Neon / local `app_test`), Vitest. Builds on Plan 1's schema (`items.number`, `UNIQUE(collection_id, number)`, nullable name column) and Plan 2's pool. The DB column for `number` and the unique index already exist — this plan adds only behaviour + the type flip.

**Spec:** `docs/plans/2026-06-10-bulk-upload-pool-design.md`

---

## Scope decision (read first — deviates intentionally from the spec's literal wording)

The design says "the `[itemId]` route segments, item links, and item **API paths** move … to the collection-scoped number." This plan moves the **page** routes and item links to the number but **keeps the API routes ULID-keyed**, because:

- The number's purpose (per the spec's own rationale) is that *a nameless item is still addressable* — that's the **page URL** a person sees, bookmarks, shares. API routes are never seen.
- Photo sub-resources (`/photos`, `/photos/[photoId]`, `/set-hero`, `/file`) resolve off `photo.itemId`, which **is** the ULID. Keying them by number would force the item's `number` onto every `Photo` object just to build an asset URL, with zero user benefit and an extra number→ULID lookup per photo fetch.
- The spec itself fixes ULIDs as the stable id for "all FKs" and "preference ids" — keeping the *internal* API surface on ULIDs is consistent with that.

Net effect: a tighter, safer PR. `src/lib/photos.ts` and all five API-route tests are **untouched**. If the owner wants the API paths renamed too, that's a separate follow-up; it is not required to ship nameless, number-addressable items.

**Out of scope (Plan 3b):** the pool → "Make an item" grouping UI, multi-select, hero pick on group. This plan only makes items number-addressable and nameless-safe.

---

## File Structure

- `src/server/repositories/ItemRepository.ts` — add `findByCollectionAndNumber`, `getNextCatalogNumber`; `create` accepts optional `number` and `name` becomes nullable.
- `src/server/repositories/implementations/ItemRepository.ts` — implement the finders + auto-allocation/retry in `create`.
- `src/lib/db/pool-schema.test.ts` — extend with DB tests for the two finders + auto-allocation.
- `src/lib/items.ts` (new) — `itemDisplayName(item)` fallback helper.
- `src/lib/items.test.ts` (new) — unit test for the helper.
- `src/types/domain.ts` — `Item.name: string` → `string | null`.
- `src/server/services/ItemService.ts` — `createItem` data `name` nullable (delegates to repo).
- `src/features/items/ItemCard.tsx` — display via `itemDisplayName`; link by `item.number`; null-safe initial.
- `src/features/results/MostLovedHero.tsx` — same.
- `src/features/items/ItemForm.tsx` — `router.push` to `item.number` (page URL); PATCH stays `item.id`.
- `src/features/items/ItemEditForm.tsx` — `router.push` to `item.number`; PATCH stays `item.id`.
- **Move (git mv):** `src/app/collections/[id]/items/[itemId]/` → `src/app/collections/[id]/items/[itemNumber]/` (3 pages: detail, `edit/`, `photos/`), each resolving by number.

**Untouched (by the scope decision):** the whole `src/app/api/collections/[id]/items/[itemId]/…` tree, its `route.test.ts`, `src/lib/photos.ts`, `PhotoGallery.tsx`/`PhotoUpload.tsx` props.

---

## Prerequisites (verify before Task 1)

- [ ] **On the feature branch** `feat/item-catalog-urls` (already created off `main`). Confirm: `git branch --show-current`.
- [ ] **Plans 1 & 2 are in `main`.** Confirm: `git log --oneline | grep -E "pool-ready schema|photo pool"`.
- [ ] **Local test DB up:** `bash e2e/fixtures/test-db.sh up` (DB tests gated by `RUN_DB_TESTS=1`). It already carries migration `0001` (number column + unique index).

---

## Task 1: Repository finders — `findByCollectionAndNumber` + `getNextCatalogNumber` (TDD, DB)

**Files:**
- Modify: `src/server/repositories/ItemRepository.ts`
- Modify: `src/server/repositories/implementations/ItemRepository.ts`
- Modify: `src/lib/db/pool-schema.test.ts`

- [ ] **Step 1: Add failing DB tests** inside the `describeDb("pool-ready schema", …)` block in `src/lib/db/pool-schema.test.ts` (append after the last `it`):

```ts
  it("findByCollectionAndNumber resolves an item by its catalog number", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_byn_1', ${collectionId}, 5, now(), now())`,
    );

    const found = await repo.findByCollectionAndNumber(collectionId, 5);
    expect(found).toMatchObject({ id: "item_byn_1", number: 5 });

    const missing = await repo.findByCollectionAndNumber(collectionId, 999);
    expect(missing).toBeNull();
  });

  it("findByCollectionAndNumber ignores soft-deleted items", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, deleted_at, created_at, updated_at) VALUES ('item_del_1', ${collectionId}, 6, now(), now(), now())`,
    );
    expect(await repo.findByCollectionAndNumber(collectionId, 6)).toBeNull();
  });

  it("getNextCatalogNumber starts at 1 and steps past the max (incl. soft-deleted)", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    expect(await repo.getNextCatalogNumber(collectionId)).toBe(1);

    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_nx_1', ${collectionId}, 3, now(), now())`,
    );
    // soft-deleted item still occupies its number in the unique index
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, deleted_at, created_at, updated_at) VALUES ('item_nx_2', ${collectionId}, 9, now(), now(), now())`,
    );
    expect(await repo.getNextCatalogNumber(collectionId)).toBe(10);
  });
```

- [ ] **Step 2: Run — RED**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: FAIL — `repo.findByCollectionAndNumber is not a function` / `repo.getNextCatalogNumber is not a function`.

- [ ] **Step 3: Add to the interface** `src/server/repositories/ItemRepository.ts` (after `findByCollection`):

```ts
  findByCollection(collectionId: string): Promise<Item[]>;
  findByCollectionAndNumber(collectionId: string, number: number): Promise<Item | null>;
  getNextCatalogNumber(collectionId: string): Promise<number>;
```

- [ ] **Step 4: Implement** in `src/server/repositories/implementations/ItemRepository.ts`. Change the top import to add `sql`:

```ts
import { eq, isNull, and, sql } from "drizzle-orm";
```

Then add these two methods after `findByCollection` (around line 59):

```ts
  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<Item | null> {
    const [item] = await this.db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.collectionId, collectionId),
          eq(itemsTable.number, number),
          isNull(itemsTable.deletedAt),
        ),
      );
    return item ? this.mapToItem(item) : null;
  }

  async getNextCatalogNumber(collectionId: string): Promise<number> {
    // MAX over ALL rows (incl. soft-deleted) — a deleted item still holds its
    // number in the UNIQUE(collection_id, number) index, so reusing it would
    // collide. Resolution (findByCollectionAndNumber) excludes deleted rows.
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${itemsTable.number})` })
      .from(itemsTable)
      .where(eq(itemsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
  }
```

- [ ] **Step 5: Run — GREEN**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: PASS (all prior + the 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/ItemRepository.ts src/server/repositories/implementations/ItemRepository.ts src/lib/db/pool-schema.test.ts
git commit -m "feat(items): findByCollectionAndNumber + getNextCatalogNumber (catalog-number resolution)"
```

---

## Task 2: Auto-allocate the catalog number inside `create` (TDD, DB)

`ItemRepository.create` allocates the next number when none is supplied, and retries on the unique-constraint race. Single source of truth for every create path.

**Files:**
- Modify: `src/server/repositories/implementations/ItemRepository.ts`
- Modify: `src/server/repositories/ItemRepository.ts` (create signature: optional `number`, nullable `name`)
- Modify: `src/lib/db/pool-schema.test.ts`

- [ ] **Step 1: Add failing DB tests** inside the `describeDb` block:

```ts
  it("create auto-allocates sequential catalog numbers", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    const a = await repo.create({ collectionId, name: "A" });
    const b = await repo.create({ collectionId, name: "B" });
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
  });

  it("create accepts a nameless item and still allocates a number", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    const item = await repo.create({ collectionId });
    expect(item.name).toBeNull();
    expect(item.number).toBe(1);
  });

  it("create honours an explicit number when given", async () => {
    const { db } = getTestDb();
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const repo = new ItemRepository(db);
    const item = await repo.create({ collectionId, name: "X", number: 42 });
    expect(item.number).toBe(42);
  });
```

- [ ] **Step 2: Run — RED**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: FAIL — items get `number: null` (no allocation yet), and `create({ collectionId })` is a type/`name` error.

- [ ] **Step 3: Update the interface** `src/server/repositories/ItemRepository.ts` — make `name` optional/nullable and add `number`:

```ts
  create(data: {
    collectionId: string;
    name?: string | null;
    number?: number;
    brand?: string;
    style?: string;
    color?: string;
    material?: string;
    category?: string;
    status?: string;
    notes?: string;
  }): Promise<Item>;
```

- [ ] **Step 4: Implement allocation + retry** in `src/server/repositories/implementations/ItemRepository.ts`. Replace the whole `create` method (lines ~11-43) with:

```ts
  async create(data: {
    id?: string;
    collectionId: string;
    name?: string | null;
    number?: number;
    brand?: string;
    style?: string;
    color?: string;
    material?: string;
    category?: string;
    status?: string;
    notes?: string;
  }): Promise<Item> {
    const id = data.id || generateId("item");
    const base = {
      id,
      collectionId: data.collectionId,
      name: data.name ?? null,
      brand: data.brand || null,
      style: data.style || null,
      color: data.color || null,
      material: data.material || null,
      category: data.category || null,
      status: data.status || null,
      notes: data.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Explicit number: single insert, let any conflict surface.
    if (data.number != null) {
      const [item] = await this.db
        .insert(itemsTable)
        .values({ ...base, number: data.number })
        .returning();
      return this.mapToItem(item);
    }

    // Auto-allocate MAX+1, retry on the UNIQUE(collection_id, number) race
    // (neon-http is stateless — no long transaction to lock the max).
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextCatalogNumber(data.collectionId);
      try {
        const [item] = await this.db
          .insert(itemsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToItem(item);
      } catch (error) {
        if (isCatalogNumberConflict(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Could not allocate a catalog number");
  }
```

Add this module-level helper at the bottom of the file (after the class):

```ts
function isCatalogNumberConflict(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" || message.includes("items_collection_number_unique");
}
```

- [ ] **Step 5: Run — GREEN**

Run: `RUN_DB_TESTS=1 npx vitest run src/lib/db/pool-schema.test.ts`
Expected: PASS (all prior + the 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/ItemRepository.ts src/server/repositories/implementations/ItemRepository.ts src/lib/db/pool-schema.test.ts
git commit -m "feat(items): create() auto-allocates catalog number (retry on unique race); nameless allowed"
```

---

## Task 3: `itemDisplayName` fallback helper (TDD, unit)

A nameless item must never render blank or crash `.charAt(0)`. One helper, used at every display + breadcrumb site.

**Files:**
- Create: `src/lib/items.ts`
- Create: `src/lib/items.test.ts`

- [ ] **Step 1: Write the failing unit test** `src/lib/items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { itemDisplayName, itemInitial } from "./items";

describe("itemDisplayName", () => {
  it("uses the name when present", () => {
    expect(itemDisplayName({ name: "Red tote", number: 3 })).toBe("Red tote");
  });

  it("falls back to #<number> for a nameless numbered item", () => {
    expect(itemDisplayName({ name: null, number: 3 })).toBe("#3");
  });

  it("falls back to 'Untitled' when there is neither name nor number", () => {
    expect(itemDisplayName({ name: null, number: null })).toBe("Untitled");
  });

  it("treats a blank/whitespace name as no name", () => {
    expect(itemDisplayName({ name: "   ", number: 3 })).toBe("#3");
  });
});

describe("itemInitial", () => {
  it("returns the first letter of the name, uppercased", () => {
    expect(itemInitial({ name: "tote", number: 3 })).toBe("T");
  });

  it("returns the number for a nameless item", () => {
    expect(itemInitial({ name: null, number: 3 })).toBe("3");
  });

  it("returns a neutral glyph when there is nothing", () => {
    expect(itemInitial({ name: null, number: null })).toBe("•");
  });
});
```

- [ ] **Step 2: Run — RED**

Run: `npx vitest run src/lib/items.test.ts`
Expected: FAIL — cannot find module `./items`.

- [ ] **Step 3: Implement** `src/lib/items.ts`:

```ts
type NameableItem = { name: string | null; number: number | null };

/** Human label for an item: its name, else its catalog number (#N), else "Untitled". */
export function itemDisplayName(item: NameableItem): string {
  const name = item.name?.trim();
  if (name) {
    return name;
  }
  return item.number != null ? `#${item.number}` : "Untitled";
}

/** Single-glyph avatar for an item with no photo: name initial, else number, else "•". */
export function itemInitial(item: NameableItem): string {
  const name = item.name?.trim();
  if (name) {
    return name.charAt(0).toUpperCase();
  }
  return item.number != null ? String(item.number) : "•";
}
```

- [ ] **Step 4: Run — GREEN**

Run: `npx vitest run src/lib/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/items.ts src/lib/items.test.ts
git commit -m "feat(items): itemDisplayName/itemInitial fallbacks for nameless items"
```

---

## Task 4: Flip `Item.name` to nullable + apply fallbacks everywhere (build is the test)

The type flip makes the compiler point at every unsafe `item.name` use; this task fixes them all so the build is clean again.

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/server/services/ItemService.ts`
- Modify: `src/features/items/ItemCard.tsx`
- Modify: `src/features/results/MostLovedHero.tsx`
- Modify: `src/app/collections/[id]/items/[itemId]/page.tsx`
- Modify: `src/app/collections/[id]/items/[itemId]/edit/page.tsx`
- Modify: `src/app/collections/[id]/items/[itemId]/photos/page.tsx`

> Note: the three pages still live at `[itemId]` here — Task 5 moves them. Editing them in place first keeps each task's build green.

- [ ] **Step 1: Flip the type** in `src/types/domain.ts` (line 75):

```ts
  name: string | null;
```

- [ ] **Step 2: Loosen the service create signature** in `src/server/services/ItemService.ts` (the `data` param of `createItem`, line ~10):

```ts
    data: {
      name?: string | null;
      brand?: string;
```

(The body `return this.repo.create({ collectionId, ...data });` is unchanged.)

- [ ] **Step 3: `ItemCard.tsx`** — `import { itemDisplayName, itemInitial } from "@/lib/items";`, then:
  - line 32 link: `` href={`/collections/${collectionId}/items/${item.number}`} `` (number, not `item.id`)
  - line 39 `alt={item.name}` → `alt={itemDisplayName(item)}`
  - line 44 `{item.name.charAt(0).toUpperCase()}` → `{itemInitial(item)}`
  - line 51 `{item.name}` → `{itemDisplayName(item)}`

- [ ] **Step 4: `MostLovedHero.tsx`** — `import { itemDisplayName, itemInitial } from "@/lib/items";`, then:
  - line 16 link: `` href={`/collections/${collectionId}/items/${item.number}`} ``
  - line 22 `alt={item.name}` → `alt={itemDisplayName(item)}`
  - line 25 `{item.name.charAt(0).toUpperCase()}` → `{itemInitial(item)}`
  - line 36 `{item.name}` → `{itemDisplayName(item)}`

- [ ] **Step 5: `[itemId]/page.tsx`** — `import { itemDisplayName } from "@/lib/items";`, then:
  - line 46 breadcrumb `{ label: item.name }` → `{ label: itemDisplayName(item) }`
  - line 52 `{item.name}` → `{itemDisplayName(item)}`
  - line 65 `alt={item.name}` → `alt={itemDisplayName(item)}`

- [ ] **Step 6: `[itemId]/edit/page.tsx`** — `import { itemDisplayName } from "@/lib/items";`, then line 37 breadcrumb label `item.name` → `itemDisplayName(item)`.

- [ ] **Step 7: `[itemId]/photos/page.tsx`** — `import { itemDisplayName } from "@/lib/items";`, then:
  - line 42 breadcrumb label `item.name` → `itemDisplayName(item)`
  - line 48 `{item.name}` → `{itemDisplayName(item)}`

- [ ] **Step 8: Build — confirm the type flip surfaces nothing else**

Run:
```bash
DATABASE_URL="postgresql://u:p@localhost:5432/db" AUTH_URL="http://localhost:3000" AUTH_SECRET="dummy-build-secret-at-least-32-characters-long-xx" npm run build
```
Expected: `Compiled successfully`. If the compiler flags any other `item.name` use not listed above (e.g. `ItemMetadata`, `ItemForm`/`ItemEditForm` form state), fix it with the same fallback: in JSX use `itemDisplayName(item)`; in editable form state use `item.name ?? ""` (forms keep requiring a name — Plan 3a does not change the form contract). Re-run until green.

- [ ] **Step 9: Commit**

```bash
git add src/types/domain.ts src/server/services/ItemService.ts src/features/items/ItemCard.tsx src/features/results/MostLovedHero.tsx "src/app/collections/[id]/items/[itemId]"
git commit -m "feat(items): Item.name nullable; display fallbacks; card/hero link by catalog number"
```

---

## Task 5: Move page routes to `[itemNumber]` + resolve by number (build is the test)

Rename the page route directory and switch each page from `findById(params.itemId)` to `findByCollectionAndNumber(params.id, Number(params.itemNumber))`. Internal photo lookups keep using the resolved `item.id` (ULID). API routes are **not** touched.

**Files:**
- Move: `src/app/collections/[id]/items/[itemId]/` → `src/app/collections/[id]/items/[itemNumber]/`
- Modify (after move): the 3 pages, `ItemForm.tsx`, `ItemEditForm.tsx`

- [ ] **Step 1: Move the directory** (preserves git history; the static sibling `items/new/` is unaffected and still wins routing for `/items/new`):

```bash
git mv "src/app/collections/[id]/items/[itemId]" "src/app/collections/[id]/items/[itemNumber]"
```

- [ ] **Step 2: Detail page** `src/app/collections/[id]/items/[itemNumber]/page.tsx` — replace the props interface, params usage, and lookup. Change the interface (line 14-16):

```ts
interface ItemDetailPageProps {
  params: { id: string; itemNumber: string };
}
```

Replace the data-loading block (lines 24-38) with a number-resolve-then-photos sequence:

```ts
  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);

  const number = Number(params.itemNumber);
  const [collection, item] = await Promise.all([
    collectionRepo.findById(params.id),
    Number.isInteger(number)
      ? itemRepo.findByCollectionAndNumber(params.id, number)
      : Promise.resolve(null),
  ]);

  if (!collection || !item) {
    redirect(`/collections/${params.id}/items`);
  }

  const photos = await photoRepo.findByItem(item.id);
  const heroPhoto = photos.find((p) => p.isHero);
```

Then update the two cross-page links to use `item.number` (they previously used `params.itemId`):
  - line 55 (Edit): `` href={`/collections/${params.id}/items/${item.number}/edit`} ``
  - lines 77, 115, 127 (Add/Manage Photos): `` href={`/collections/${params.id}/items/${item.number}/photos`} ``

(`getPhotoAssetUrlForPhoto(heroPhoto, params.id)` / `(photo, params.id)` are unchanged — they take the collection id, and the photos belong to `item`.)

- [ ] **Step 3: Edit page** `src/app/collections/[id]/items/[itemNumber]/edit/page.tsx`:

Interface (line 9-11):
```ts
interface ItemEditPageProps {
  params: { id: string; itemNumber: string };
}
```

Replace the load block (lines 19-29):
```ts
  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const number = Number(params.itemNumber);
  const [collection, item] = await Promise.all([
    collectionRepo.findById(params.id),
    Number.isInteger(number)
      ? itemRepo.findByCollectionAndNumber(params.id, number)
      : Promise.resolve(null),
  ]);

  if (!collection || !item) {
    redirect(`/collections/${params.id}/items`);
  }
```

Breadcrumb back-link (line 37) → use the number:
```ts
        { label: itemDisplayName(item), href: `/collections/${params.id}/items/${item.number}` },
```

(`<ItemEditForm item={item} collectionId={params.id} />` is unchanged — it gets the full item.)

- [ ] **Step 4: Photos page** `src/app/collections/[id]/items/[itemNumber]/photos/page.tsx`:

Interface (line 12-14):
```ts
interface PhotoPageProps {
  params: { id: string; itemNumber: string };
}
```

Replace the load block (lines 22-34) with resolve-by-number then photos:
```ts
  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);

  const number = Number(params.itemNumber);
  const [collection, item] = await Promise.all([
    collectionRepo.findById(params.id),
    Number.isInteger(number)
      ? itemRepo.findByCollectionAndNumber(params.id, number)
      : Promise.resolve(null),
  ]);

  if (!collection || !item) {
    redirect(`/collections/${params.id}/items`);
  }

  const photos = await photoRepo.findByItem(item.id);
```

Breadcrumb back-link (line 42) → `` href={`/collections/${params.id}/items/${item.number}`} `` with `label: itemDisplayName(item)`.

The child components keep the ULID — they call the unchanged ULID-keyed API routes:
  - line 55 `<PhotoUpload itemId={params.itemId} …>` → `itemId={item.id}`
  - line 62 `<PhotoGallery … itemId={params.itemId} …>` → `itemId={item.id}`

- [ ] **Step 5: `ItemForm.tsx`** — the page redirect uses the number; the PATCH API call keeps the ULID:
  - line 50 (after create): `` router.push(`/collections/${collectionId}/items/${result.number}`); `` (the created item carries its allocated number)
  - line 52 (PATCH): **unchanged** — `` apiPatch(`/api/collections/${collectionId}/items/${item.id}`, validated) ``
  - line 53 (after edit redirect): `` router.push(`/collections/${collectionId}/items/${item.number}`); ``

- [ ] **Step 6: `ItemEditForm.tsx`**:
  - line 44 (PATCH): **unchanged** — `` `/api/collections/${collectionId}/items/${item.id}` ``
  - line 56 (redirect): `` router.push(`/collections/${collectionId}/items/${item.number}`); ``

- [ ] **Step 7: Build**

Run:
```bash
DATABASE_URL="postgresql://u:p@localhost:5432/db" AUTH_URL="http://localhost:3000" AUTH_SECRET="dummy-build-secret-at-least-32-characters-long-xx" npm run build
```
Expected: `Compiled successfully`. The new route is `/collections/[id]/items/[itemNumber]` (+ `/edit`, `/photos`).

- [ ] **Step 8: Commit**

```bash
git add "src/app/collections/[id]/items" src/features/items/ItemForm.tsx src/features/items/ItemEditForm.tsx
git commit -m "refactor(items): address item pages by catalog number ([itemNumber]); APIs stay ULID-keyed"
```

---

## Task 6: Backfill existing numberless items + full gate + manual verify + PR

Existing items created before this plan have `number = NULL`, so their page URL would be `/items/null`. Backfill assigns each a number. (Dev data is disposable per the spec, but prod's `main` Neon branch may hold real numberless items — the prod outage fix truncated only `photos`, not `items`.)

**Files:** none (data + gates)

- [ ] **Step 1: Backfill the dev Neon branch.** Assign sequential numbers (by `created_at`) to numberless, non-deleted items per collection:

```bash
npx dotenv -e .env.local -- node -e "
const p = require('postgres');
const s = p(process.env.DATABASE_URL, { max: 1 });
s\`
  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY collection_id ORDER BY created_at, id
    ) AS rn
    FROM items
    WHERE number IS NULL AND deleted_at IS NULL
  )
  UPDATE items i SET number = r.rn FROM ranked r WHERE i.id = r.id
\`.then((res) => { console.log('backfilled rows:', res.count); return s.end(); });
"
```

Note: this numbers from 1 assuming collections with numberless items have no numbered items yet (true for pre-Plan-3 data). If a collection already mixes numbered + numberless items, replace `row_number() OVER (...)` start by adding `+ COALESCE((SELECT MAX(number) FROM items WHERE collection_id = ...), 0)`; for disposable dev data the simple form is fine.

- [ ] **Step 2: Backfill the prod (`main`) Neon branch.** Point `DATABASE_URL` at prod and repeat Step 1. (Confirm with the owner first; prod is live.)

- [ ] **Step 3: Full gate**

Run:
```bash
npm run build
npm run test:ci
npm run lint
npm run auth:verify
RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/pool-schema.test.ts src/lib/db/e2e-db.test.ts
```
Expected: all exit 0. (`--no-file-parallelism` avoids the known multi-DB-test deadlock; `test:ci` skips the `RUN_DB_TESTS`-gated suites.)

- [ ] **Step 4: Manual verification** (localhost is fine here — no Blob callback involved):

  - `npm run dev`; open a collection with items. Confirm each item card opens at `/collections/{id}/items/{N}` (number in the URL bar).
  - Create a new item via "Add Item" → lands on `/items/{N}` with a number; reload works.
  - Open an item → Edit → Save → returns to `/items/{N}`. Open → Photos → upload a photo (ULID-keyed API still works), set hero, delete.
  - Visit `/collections/{id}/items/999999` (no such number) → redirects to the items list (no crash).
  - Screenshot the item detail + items grid (light + dark) for the PR (UI PRs include screenshots).

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/item-catalog-urls
gh pr create --title "feat(items): catalog-number item URLs + nameless items (bulk upload 3a/4)" --body "Implements docs/plans/2026-06-13-bulk-upload-plan-3a-catalog-urls.md. Items now carry an auto-allocated per-collection catalog number (allocated in ItemRepository.create, retry on the unique race) and are addressed by it in the page URL (/collections/{id}/items/{N}); Item.name is nullable with an itemDisplayName(#N) fallback at every display + breadcrumb site. API routes stay ULID-keyed by design (see plan 'Scope decision') — photo asset plumbing and its tests are untouched. Backfilled existing numberless items on dev + prod Neon. Plan 3b (pool → 'Make an item' grouping UI) builds on this. Part of purses-b1k. Screenshots: light + dark."
```

---

## Self-Review

- **Spec coverage (Plan 3a slice):** catalog-number allocation (Task 2), item-URL refactor to number (Task 5), `Item.name` nullable + nameless display (Tasks 3–4), resolve-by-number + next-number finders (Task 1), backfill (Task 6). Grouping UI is explicitly Plan 3b; deferred-metadata surfacing is Plan 4.
- **Scope deviation, owned:** API routes stay ULID-keyed (documented in "Scope decision") — delivers the user-visible goal (number-addressable, nameless items) without threading `number` onto every `Photo`; `lib/photos.ts` and the 5 API tests untouched.
- **Allocation correctness:** `getNextCatalogNumber` maxes over ALL rows (incl. soft-deleted) so it never collides with a number still held in the unique index; `findByCollectionAndNumber` excludes deleted so a tombstoned number doesn't resolve; `create` retries the `23505` race up to 5×.
- **Null-safety:** the `Item.name` flip (Task 4) is gated by the compiler — Step 8 re-runs build until every `item.name` use is fallback-guarded; `itemDisplayName`/`itemInitial` are unit-tested (Task 3) incl. blank-string and no-number cases.
- **TDD:** finders + allocation are DB red→green (Tasks 1–2); the helper is unit red→green (Task 3); the type flip and route move use the build as the type-level test (Tasks 4–5).
- **Type consistency:** `findByCollectionAndNumber(collectionId, number): Promise<Item | null>` and `getNextCatalogNumber(collectionId): Promise<number>` identical across interface + impl + tests; `create` data shape (`name?: string | null`, `number?: number`) identical across interface + impl; `itemDisplayName(item)`/`itemInitial(item)` identical across helper + all call sites.
- **Routing safety:** static `items/new/` still wins over dynamic `[itemNumber]`; non-numeric/unknown numbers redirect to the items list rather than crash (`Number.isInteger` guard + null-item redirect).
- **Placeholder scan:** every step carries concrete code/commands; the only conditional note (Step 1 mixed-number SQL) is a documented branch for non-disposable data, not deferred work.
- **TONE:** no user-facing copy changes; nameless items read as a quiet `#N`, never "Untitled item (incomplete)" or any nag (TONE commitment 4).
