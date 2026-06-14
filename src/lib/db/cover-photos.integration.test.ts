import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test: real PhotoRepository -> the local test DB. Exercises the
// batched cover-photo lookup (hero wins, else earliest non-deleted) end to end
// with no mocks between the repo and Postgres.
describeDb("cover-photo lookup (repo -> DB)", () => {
  let userId: string;
  let collectionId: string;

  function photoRepo() {
    const { db } = getTestDb();
    return new PhotoRepository(db);
  }

  function itemRepo() {
    const { db } = getTestDb();
    return new ItemRepository(db);
  }

  // createdAt ordering is the tie-breaker for "earliest non-hero", so each
  // photo must get a distinct, monotonically-increasing createdAt. We control
  // it by stamping createdAt explicitly via an UPDATE after create.
  let clock = 0;
  async function seedPhoto(
    itemId: string,
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
    const { db } = getTestDb();
    collectionId = "col_cover_test";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Cover photo test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("hero wins over an earlier non-hero photo", async () => {
    const item = await itemRepo().create({ collectionId });
    const a1 = await seedPhoto(item.id, "a1", false); // earlier, non-hero
    const a2 = await seedPhoto(item.id, "a2", true); // later, hero

    const covers = await photoRepo().findCoverPhotosByItemIds([item.id]);
    expect(covers.get(item.id)?.id).toBe(a2.id);
    expect(covers.get(item.id)?.id).not.toBe(a1.id);
  });

  it("falls back to the earliest photo when there is no hero", async () => {
    const item = await itemRepo().create({ collectionId });
    const b1 = await seedPhoto(item.id, "b1", false); // earliest
    await seedPhoto(item.id, "b2", false);

    const covers = await photoRepo().findCoverPhotosByItemIds([item.id]);
    expect(covers.get(item.id)?.id).toBe(b1.id);
  });

  it("excludes soft-deleted photos (a deleted hero is ignored)", async () => {
    const item = await itemRepo().create({ collectionId });
    const c1 = await seedPhoto(item.id, "c1", true); // hero, then deleted
    const c2 = await seedPhoto(item.id, "c2", false); // remains
    await photoRepo().softDelete(c1.id);

    const covers = await photoRepo().findCoverPhotosByItemIds([item.id]);
    expect(covers.get(item.id)?.id).toBe(c2.id);
  });

  it("omits an item that has no photos", async () => {
    const item = await itemRepo().create({ collectionId });

    const covers = await photoRepo().findCoverPhotosByItemIds([item.id]);
    expect(covers.has(item.id)).toBe(false);
  });

  it("batches multiple items in one call, each resolving its own cover", async () => {
    const itemA = await itemRepo().create({ collectionId });
    const itemB = await itemRepo().create({ collectionId });
    const itemEmpty = await itemRepo().create({ collectionId });

    const a1 = await seedPhoto(itemA.id, "ba1", false);
    const a2 = await seedPhoto(itemA.id, "ba2", true); // hero wins for A
    const b1 = await seedPhoto(itemB.id, "bb1", false); // earliest wins for B
    await seedPhoto(itemB.id, "bb2", false);

    const covers = await photoRepo().findCoverPhotosByItemIds([
      itemA.id,
      itemB.id,
      itemEmpty.id,
    ]);

    expect(covers.get(itemA.id)?.id).toBe(a2.id);
    expect(covers.get(itemA.id)?.id).not.toBe(a1.id);
    expect(covers.get(itemB.id)?.id).toBe(b1.id);
    expect(covers.has(itemEmpty.id)).toBe(false);
  });

  it("returns an empty map for empty input", async () => {
    const covers = await photoRepo().findCoverPhotosByItemIds([]);
    expect(covers.size).toBe(0);
  });
});
