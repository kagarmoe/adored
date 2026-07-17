import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test: real PhotoRepository -> the local test DB. Exercises the
// batched collection-cover lookup (a collection's representative assigned photo:
// hero wins, else earliest; pooled and soft-deleted excluded) end to end with no
// mocks between the repo and Postgres.
describeDb("collection-cover lookup (repo -> DB)", () => {
  let userId: string;

  function photoRepo() {
    const { db } = getTestDb();
    return new PhotoRepository(db);
  }

  function itemRepo() {
    const { db } = getTestDb();
    return new ItemRepository(db);
  }

  async function seedCollection(id: string) {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${id}, ${userId}, ${`Collection ${id}`}, 'active', now(), now())
    `);
    return id;
  }

  // createdAt ordering is the tie-breaker for "earliest assigned", so each photo
  // must get a distinct, monotonically-increasing createdAt. We stamp createdAt
  // explicitly via an UPDATE after create.
  let clock = 0;
  async function seedPhoto(
    collectionId: string,
    itemId: string | null,
    blobKey: string,
    isHero: boolean,
  ) {
    const photo = await photoRepo().create({
      itemId,
      collectionId,
      blobKey,
      filename: `${blobKey}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero,
    });
    clock += 1;
    const { db } = getTestDb();
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clock));
    await db.execute(
      sql`UPDATE photos SET created_at = ${createdAt.toISOString()}::timestamptz WHERE id = ${photo.id}`,
    );
    return { ...photo, createdAt };
  }

  beforeEach(async () => {
    await resetDb();
    clock = 0;
    userId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("hero item photo wins over an earlier non-hero photo in the same collection", async () => {
    const collectionId = await seedCollection("col_hero");
    const item = await itemRepo().create({ collectionId });
    const a1 = await seedPhoto(collectionId, item.id, "a1", false); // earlier, non-hero
    const a2 = await seedPhoto(collectionId, item.id, "a2", true); // later, hero

    const covers = await photoRepo().findCoverPhotosByCollectionIds([collectionId]);
    expect(covers.get(collectionId)?.id).toBe(a2.id);
    expect(covers.get(collectionId)?.id).not.toBe(a1.id);
  });

  it("falls back to the earliest assigned photo when there is no hero", async () => {
    const collectionId = await seedCollection("col_earliest");
    const item = await itemRepo().create({ collectionId });
    const b1 = await seedPhoto(collectionId, item.id, "b1", false); // earliest
    await seedPhoto(collectionId, item.id, "b2", false);

    const covers = await photoRepo().findCoverPhotosByCollectionIds([collectionId]);
    expect(covers.get(collectionId)?.id).toBe(b1.id);
  });

  it("excludes pooled photos: a collection whose only photo is pooled has no cover", async () => {
    const collectionId = await seedCollection("col_pooled");
    await seedPhoto(collectionId, null, "pooled", false); // item_id IS NULL

    const covers = await photoRepo().findCoverPhotosByCollectionIds([collectionId]);
    expect(covers.has(collectionId)).toBe(false);
  });

  it("excludes soft-deleted photos (a deleted hero is ignored)", async () => {
    const collectionId = await seedCollection("col_deleted");
    const item = await itemRepo().create({ collectionId });
    const c1 = await seedPhoto(collectionId, item.id, "c1", true); // hero, then deleted
    const c2 = await seedPhoto(collectionId, item.id, "c2", false); // remains
    await photoRepo().softDelete(c1.id);

    const covers = await photoRepo().findCoverPhotosByCollectionIds([collectionId]);
    expect(covers.get(collectionId)?.id).toBe(c2.id);
  });

  it("batches two collections, each resolving its own cover; a third empty collection is absent", async () => {
    const colA = await seedCollection("col_a");
    const colB = await seedCollection("col_b");
    const colEmpty = await seedCollection("col_empty");

    const itemA = await itemRepo().create({ collectionId: colA });
    const itemB = await itemRepo().create({ collectionId: colB });

    const a1 = await seedPhoto(colA, itemA.id, "ca1", false);
    const a2 = await seedPhoto(colA, itemA.id, "ca2", true); // hero wins for A
    const b1 = await seedPhoto(colB, itemB.id, "cb1", false); // earliest wins for B
    await seedPhoto(colB, itemB.id, "cb2", false);

    const covers = await photoRepo().findCoverPhotosByCollectionIds([
      colA,
      colB,
      colEmpty,
    ]);

    expect(covers.get(colA)?.id).toBe(a2.id);
    expect(covers.get(colA)?.id).not.toBe(a1.id);
    expect(covers.get(colB)?.id).toBe(b1.id);
    expect(covers.has(colEmpty)).toBe(false);
  });

  it("returns an empty map for empty input", async () => {
    const covers = await photoRepo().findCoverPhotosByCollectionIds([]);
    expect(covers.size).toBe(0);
  });
});
