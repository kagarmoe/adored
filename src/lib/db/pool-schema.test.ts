import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";

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
    const rows = await db.execute(
      sql`SELECT collection_id, item_id FROM photos WHERE id = 'photo_pool_1'`,
    );
    expect(rows[0]).toMatchObject({ collection_id: collectionId, item_id: null });
  });

  it("accepts a nameless item with a unit default", async () => {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO items (id, collection_id, number, created_at, updated_at)
      VALUES ('item_nameless_1', ${collectionId}, 1, now(), now())
    `);
    const rows = await db.execute(
      sql`SELECT name, unit, number FROM items WHERE id = 'item_nameless_1'`,
    );
    expect(rows[0]).toMatchObject({ name: null, unit: "imperial", number: 1 });
  });

  it("enforces a unique catalog number per collection", async () => {
    const { db } = getTestDb();
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_n1', ${collectionId}, 7, now(), now())`,
    );
    await expect(
      db.execute(
        sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_n2', ${collectionId}, 7, now(), now())`,
      ),
    ).rejects.toThrow();
  });

  it("stores dimensions and weight", async () => {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO items (id, collection_id, number, height, width, depth, weight, unit, created_at, updated_at)
      VALUES ('item_dim_1', ${collectionId}, 2, 10.5, 8, 3, 1.25, 'imperial', now(), now())
    `);
    const rows = await db.execute(
      sql`SELECT height, weight FROM items WHERE id = 'item_dim_1'`,
    );
    expect(Number(rows[0].height)).toBe(10.5);
    expect(Number(rows[0].weight)).toBe(1.25);
  });

  it("PhotoRepository persists a pool photo via the typed layer", async () => {
    const { db } = getTestDb();
    const { PhotoRepository } = await import(
      "@/server/repositories/implementations/PhotoRepository"
    );
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

  it("findPoolByCollection returns only unassigned, non-deleted photos", async () => {
    const { db } = getTestDb();
    const { PhotoRepository } = await import(
      "@/server/repositories/implementations/PhotoRepository"
    );
    const repo = new PhotoRepository(db);

    // an item to attach one photo to (so it is NOT pooled)
    await db.execute(
      sql`INSERT INTO items (id, collection_id, number, created_at, updated_at) VALUES ('item_p1', ${collectionId}, 1, now(), now())`,
    );
    // pooled (item_id NULL)
    await repo.create({
      itemId: null,
      collectionId,
      blobKey: "p1",
      filename: "p1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
    // assigned (NOT pooled)
    await repo.create({
      itemId: "item_p1",
      collectionId,
      blobKey: "a1",
      filename: "a1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
    // pooled but soft-deleted (excluded)
    const deleted = await repo.create({
      itemId: null,
      collectionId,
      blobKey: "d1",
      filename: "d1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
    await repo.softDelete(deleted.id);

    // a pooled photo in a DIFFERENT collection (must be excluded)
    await db.execute(
      sql`INSERT INTO collections (id, owner_id, name, status, created_at, updated_at) VALUES ('col_other_pool', ${userId}, 'Other', 'active', now(), now())`,
    );
    await repo.create({
      itemId: null,
      collectionId: "col_other_pool",
      blobKey: "o1",
      filename: "o1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });

    const pool = await repo.findPoolByCollection(collectionId);
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ blobKey: "p1", itemId: null, collectionId });
  });

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
    expect(count).toBe(1);
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
});
