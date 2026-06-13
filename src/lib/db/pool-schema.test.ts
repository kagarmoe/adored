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
});
