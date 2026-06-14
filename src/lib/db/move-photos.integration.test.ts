import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemService, PoolGroupError } from "@/server/services/ItemService";
import type { Item } from "@/types";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test for the unified "Move to…" reassign flow: real ItemService
// -> real ItemRepository/PhotoRepository -> the local test DB. The whole point is
// hero reconciliation — a source whose hero moved away promotes a remaining
// photo; a heroless target gets one promoted; targets keep their own hero.
describeDb("move-photos reassign seam (service -> repo -> DB)", () => {
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

  async function seedItem(): Promise<Item> {
    return itemRepo().create({ collectionId });
  }

  async function seedPhoto(itemId: string | null, blobKey: string, isHero: boolean) {
    return photoRepo().create({
      itemId,
      collectionId,
      blobKey,
      filename: `${blobKey}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero,
    });
  }

  function heroes(photos: { id: string; isHero: boolean }[]) {
    return photos.filter((p) => p.isHero).map((p) => p.id);
  }

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_seam_move";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Seam move test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("moves a source's hero to an existing item: source promotes a remaining photo, target keeps its hero", async () => {
    const itemA = await seedItem();
    const a1 = await seedPhoto(itemA.id, "movA1", true);
    const a2 = await seedPhoto(itemA.id, "movA2", false);
    const itemB = await seedItem();
    const b1 = await seedPhoto(itemB.id, "movB1", true);

    await makeService().reassignPhotos(collectionId, [a1.id], {
      type: "item",
      itemId: itemB.id,
    });

    const movedA1 = await photoRepo().findById(a1.id);
    expect(movedA1?.itemId).toBe(itemB.id);
    expect(movedA1?.isHero).toBe(false);

    expect(heroes(await photoRepo().findByItem(itemB.id))).toEqual([b1.id]);
    expect(heroes(await photoRepo().findByItem(itemA.id))).toEqual([a2.id]);
  });

  it("splits to a new item: first moved photo is hero, source is left empty", async () => {
    const itemA = await seedItem();
    const a1 = await seedPhoto(itemA.id, "splA1", true);
    const a2 = await seedPhoto(itemA.id, "splA2", false);

    const result = await makeService().reassignPhotos(collectionId, [a1.id, a2.id], {
      type: "new",
    });
    expect(result.number).toBeGreaterThan(0);

    const created = await itemRepo().findByCollectionAndNumber(
      collectionId,
      result.number!,
    );
    expect(created).not.toBeNull();
    const newPhotos = await photoRepo().findByItem(created!.id);
    expect(newPhotos.map((p) => p.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(heroes(newPhotos)).toEqual([a1.id]);

    expect(await photoRepo().findByItem(itemA.id)).toHaveLength(0);
  });

  it("returns to the pool: hero cleared, photo lands in the pool, source emptied", async () => {
    const itemB = await seedItem();
    const b1 = await seedPhoto(itemB.id, "poolB1", true);

    const result = await makeService().reassignPhotos(collectionId, [b1.id], {
      type: "pool",
    });
    expect(result.number).toBeNull();

    const moved = await photoRepo().findById(b1.id);
    expect(moved?.itemId).toBeNull();
    expect(moved?.isHero).toBe(false);

    const pool = await photoRepo().findPoolByCollection(collectionId);
    expect(pool.map((p) => p.id)).toContain(b1.id);
    expect(await photoRepo().findByItem(itemB.id)).toHaveLength(0);
  });

  it("moves a source's hero to the pool: source promotes a remaining photo to hero", async () => {
    const itemA = await seedItem();
    const a1 = await seedPhoto(itemA.id, "phA1", true);
    const a2 = await seedPhoto(itemA.id, "phA2", false);

    await makeService().reassignPhotos(collectionId, [a1.id], { type: "pool" });

    expect(heroes(await photoRepo().findByItem(itemA.id))).toEqual([a2.id]);
  });

  it("conflict: a nonexistent id rejects and touches nothing (no new item created)", async () => {
    const itemA = await seedItem();
    const a1 = await seedPhoto(itemA.id, "cfA1", true);
    await seedPhoto(itemA.id, "cfA2", false);

    const before = await itemRepo().findByCollection(collectionId);

    const error = await makeService()
      .reassignPhotos(collectionId, [a1.id, "photo_nope"], { type: "new" })
      .then(
        () => {
          throw new Error("expected reject");
        },
        (e) => e,
      );
    expect(error).toBeInstanceOf(PoolGroupError);
    expect((error as PoolGroupError).code).toBe("conflict");

    expect((await photoRepo().findById(a1.id))?.itemId).toBe(itemA.id);
    const after = await itemRepo().findByCollection(collectionId);
    expect(after).toHaveLength(before.length);
  });

  it("moves into a heroless target: a hero is promoted there", async () => {
    const itemA = await seedItem();
    await seedPhoto(itemA.id, "hlA1", true);
    const a2 = await seedPhoto(itemA.id, "hlA2", false);
    const itemC = await seedItem();
    await seedPhoto(itemC.id, "hlC1", false); // heroless target

    await makeService().reassignPhotos(collectionId, [a2.id], {
      type: "item",
      itemId: itemC.id,
    });

    expect(heroes(await photoRepo().findByItem(itemC.id))).toHaveLength(1);
  });
});
