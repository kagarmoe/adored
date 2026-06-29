import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam test for the /collections "Photos waiting" cue (Task 7): real
// PhotoRepository -> the local test DB, no mocks. The cue method is the ONLY new
// data access on the collection list, and the whole point of the task is that it
// can never leak another user's pool state. These tests prove:
//   - the result is a BOUNDED aggregate (a Set of collection ids — at most one
//     row per input id, never photo rows);
//   - it reflects pool state ONLY for the collection ids it is handed (the
//     page hands it the authenticated user's already-access-filtered ids), so a
//     second user's pooled photos never appear;
//   - it counts only genuinely pooled photos (item_id IS NULL, not deleted).
describeDb("collection-list pool cue (repo -> DB)", () => {
  let userA: string;
  let userB: string;

  function photoRepo() {
    const { db } = getTestDb();
    return new PhotoRepository(db);
  }

  function itemRepo() {
    const { db } = getTestDb();
    return new ItemRepository(db);
  }

  async function seedCollection(id: string, ownerId: string) {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${id}, ${ownerId}, ${`Collection ${id}`}, 'active', now(), now())
    `);
    return id;
  }

  async function seedPhoto(opts: {
    collectionId: string;
    itemId?: string | null;
    blobKey: string;
    deleted?: boolean;
  }) {
    const photo = await photoRepo().create({
      itemId: opts.itemId ?? null,
      collectionId: opts.collectionId,
      blobKey: opts.blobKey,
      filename: `${opts.blobKey}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userA,
      isHero: false,
    });
    if (opts.deleted) await photoRepo().softDelete(photo.id);
    return photo;
  }

  beforeEach(async () => {
    await resetDb();
    userA = await seedBaseline();
    userB = await seedUserRow("pool-cue-other");
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns a bounded Set of collection ids (aggregate signal, not photo rows)", async () => {
    const colWithPool = await seedCollection("col_cue_pool", userA);
    const colEmpty = await seedCollection("col_cue_empty", userA);
    // many pooled photos in one collection — the cue must collapse to ONE entry,
    // proving it is an aggregate signal and not a per-photo read.
    for (let i = 0; i < 7; i++) {
      await seedPhoto({ collectionId: colWithPool, blobKey: `pool-${i}` });
    }

    const result = await photoRepo().findCollectionIdsWithPooledPhotos([
      colWithPool,
      colEmpty,
    ]);

    expect(result).toBeInstanceOf(Set);
    expect([...result]).toEqual([colWithPool]); // collapsed to one id, not 7 rows
    expect(result.size).toBeLessThanOrEqual(2); // at most one row per input id
    for (const entry of result) expect(typeof entry).toBe("string");
  });

  it("never reflects another user's pool state, even when that user has pooled photos", async () => {
    const colA = await seedCollection("col_cue_a", userA);
    const colB = await seedCollection("col_cue_b", userB);
    // user A's collection has NO pooled photos; user B's collection is full of them.
    for (let i = 0; i < 5; i++) {
      await seedPhoto({ collectionId: colB, blobKey: `b-pool-${i}` });
    }

    // The page only ever hands the cue user A's accessible collection ids.
    const result = await photoRepo().findCollectionIdsWithPooledPhotos([colA]);

    expect(result.has(colA)).toBe(false); // A has no pool
    expect(result.has(colB)).toBe(false); // B's pool state never leaks in
    expect(result.size).toBe(0);
  });

  it("only returns ids that were passed in (foreign ids are never surfaced)", async () => {
    const colA = await seedCollection("col_cue_scoped_a", userA);
    const colB = await seedCollection("col_cue_scoped_b", userB);
    await seedPhoto({ collectionId: colA, blobKey: "a-pool" });
    await seedPhoto({ collectionId: colB, blobKey: "b-pool" });

    const result = await photoRepo().findCollectionIdsWithPooledPhotos([colA]);

    expect([...result]).toEqual([colA]);
    expect(result.has(colB)).toBe(false);
  });

  it("excludes a collection whose only pooled photo is soft-deleted", async () => {
    const col = await seedCollection("col_cue_deleted", userA);
    await seedPhoto({ collectionId: col, blobKey: "gone", deleted: true });

    const result = await photoRepo().findCollectionIdsWithPooledPhotos([col]);

    expect(result.has(col)).toBe(false);
  });

  it("excludes a collection whose only photo is assigned to an item (not pooled)", async () => {
    const col = await seedCollection("col_cue_assigned", userA);
    const item = await itemRepo().create({ collectionId: col });
    await seedPhoto({ collectionId: col, itemId: item.id, blobKey: "assigned" });

    const result = await photoRepo().findCollectionIdsWithPooledPhotos([col]);

    expect(result.has(col)).toBe(false);
  });

  it("returns only the pooled-bearing subset across a mixed batch", async () => {
    const pooled = await seedCollection("col_cue_mix_pooled", userA);
    const assignedOnly = await seedCollection("col_cue_mix_assigned", userA);
    const deletedOnly = await seedCollection("col_cue_mix_deleted", userA);
    const empty = await seedCollection("col_cue_mix_empty", userA);

    await seedPhoto({ collectionId: pooled, blobKey: "mix-pool" });
    const item = await itemRepo().create({ collectionId: assignedOnly });
    await seedPhoto({ collectionId: assignedOnly, itemId: item.id, blobKey: "mix-assigned" });
    await seedPhoto({ collectionId: deletedOnly, blobKey: "mix-deleted", deleted: true });

    const result = await photoRepo().findCollectionIdsWithPooledPhotos([
      pooled,
      assignedOnly,
      deletedOnly,
      empty,
    ]);

    expect([...result].sort()).toEqual([pooled]);
  });

  it("returns an empty Set for empty input (no query needed)", async () => {
    const result = await photoRepo().findCollectionIdsWithPooledPhotos([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
