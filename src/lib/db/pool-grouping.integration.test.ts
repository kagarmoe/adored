import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemService, PoolGroupError } from "@/server/services/ItemService";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test: real ItemService -> real ItemRepository/PhotoRepository
// -> the local test DB. Exercises the create -> assign -> count-guard flow end
// to end with no mocks between the service and Postgres.
describeDb("pool grouping seam (service -> repo -> DB)", () => {
  let userId: string;
  let collectionId: string;

  function makeService() {
    const { db } = getTestDb();
    return new ItemService(new ItemRepository(db), new PhotoRepository(db));
  }

  function photoRepo() {
    const { db } = getTestDb();
    return new PhotoRepository(db);
  }

  function itemRepo() {
    const { db } = getTestDb();
    return new ItemRepository(db);
  }

  async function seedPooled(blobKey: string) {
    return photoRepo().create({
      itemId: null,
      collectionId,
      blobKey,
      filename: `${blobKey}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
  }

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_seam_pool";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Seam pool test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("happy path: groups pooled photos into an item, first selected is hero, pool drains", async () => {
    const p1 = await seedPooled("seam1");
    const p2 = await seedPooled("seam2");

    const item = await makeService().createItemFromPool(collectionId, [p1.id, p2.id]);
    expect(item.number).toBeGreaterThan(0);

    const assigned = await photoRepo().findByItem(item.id);
    expect(assigned).toHaveLength(2);
    expect(assigned.filter((p) => p.isHero).map((p) => p.id)).toEqual([p1.id]);

    const pool = await photoRepo().findPoolByCollection(collectionId);
    expect(pool).toHaveLength(0);
  });

  it("conflict path: rejects and leaves the system clean (mine still pooled, no orphan item)", async () => {
    const mine = await seedPooled("mine1");
    const error = await makeService()
      .createItemFromPool(collectionId, [mine.id, "photo_nonexistent"])
      .then(() => { throw new Error("expected reject"); }, (e) => e);
    expect(error).toBeInstanceOf(PoolGroupError);
    expect((error as PoolGroupError).code).toBe("conflict");
    const pool = await photoRepo().findPoolByCollection(collectionId);
    expect(pool.map((p) => p.id)).toContain(mine.id);
    const items = await itemRepo().findByCollection(collectionId);
    expect(items).toHaveLength(0);
  });
});
