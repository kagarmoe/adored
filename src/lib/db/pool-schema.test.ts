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
});
