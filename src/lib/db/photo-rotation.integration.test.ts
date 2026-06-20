import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test for the persisted photo.rotation column: real
// PhotoRepository -> the local test DB. mapToPhoto is `any`-typed, so a forgotten
// mapping would silently drop the field — this guards the round-trip.
describeDb("photo rotation persistence (repo -> DB)", () => {
  let userId: string;
  let collectionId: string;

  function photoRepo() {
    return new PhotoRepository(getTestDb().db);
  }

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_rotation";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Rotation test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("defaults rotation to 0 on insert (create without rotation)", async () => {
    const item = await new ItemRepository(getTestDb().db).create({ collectionId });
    const photo = await photoRepo().create({
      itemId: item.id,
      collectionId,
      blobKey: "rot1",
      filename: "rot1.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: true,
    });
    expect(photo.rotation).toBe(0);
    const reloaded = await photoRepo().findById(photo.id);
    expect(reloaded?.rotation).toBe(0);
  });

  it("round-trips a rotation update through findById and findByItem", async () => {
    const item = await new ItemRepository(getTestDb().db).create({ collectionId });
    const photo = await photoRepo().create({
      itemId: item.id,
      collectionId,
      blobKey: "rot2",
      filename: "rot2.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: true,
    });

    await photoRepo().update(photo.id, { rotation: 90 });

    expect((await photoRepo().findById(photo.id))?.rotation).toBe(90);
    const byItem = await photoRepo().findByItem(item.id);
    expect(byItem.find((p) => p.id === photo.id)?.rotation).toBe(90);
  });
});
