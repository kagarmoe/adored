import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPoolPhotoAssetUrl } from "@/lib/photos";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Un-mocked seam tests for the bounded workspace preview reads (Task 2):
// real PhotoRepository / ItemRepository -> the local test DB, no mocks. These
// prove the SQL LIMIT (not a UI slice), the deterministic ordering with a unique
// tiebreaker, and the pool filters (deleted / assigned / foreign collection).
describeDb("workspace pool preview (repo -> DB)", () => {
  let userId: string;
  let collectionId: string;
  let otherCollectionId: string;

  function photoRepo() {
    const { db } = getTestDb();
    return new PhotoRepository(db);
  }

  function itemRepo() {
    const { db } = getTestDb();
    return new ItemRepository(db);
  }

  // created_at is the primary order key; each pooled photo must get a distinct,
  // monotonically-increasing created_at so a LIMIT cut is deterministic. We
  // stamp it explicitly via an UPDATE after create (same technique the
  // cover-photo integration test uses).
  let clock = 0;
  async function seedPhoto(opts: {
    blobKey: string;
    collection?: string;
    itemId?: string | null;
    deleted?: boolean;
  }) {
    const photo = await photoRepo().create({
      itemId: opts.itemId ?? null,
      collectionId: opts.collection ?? collectionId,
      blobKey: opts.blobKey,
      filename: `${opts.blobKey}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
    clock += 1;
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clock));
    const { db } = getTestDb();
    await db.execute(
      sql`UPDATE photos SET created_at = ${createdAt.toISOString()}::timestamptz WHERE id = ${photo.id}`,
    );
    if (opts.deleted) {
      await photoRepo().softDelete(photo.id);
    }
    return { ...photo, createdAt };
  }

  beforeEach(async () => {
    await resetDb();
    clock = 0;
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_workspace_pool";
    otherCollectionId = "col_workspace_other";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES
        (${collectionId}, ${userId}, 'Workspace pool test', 'active', now(), now()),
        (${otherCollectionId}, ${userId}, 'Other collection', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns at most 6 when more than 6 pooled photos exist", async () => {
    const seeded = [];
    for (let i = 0; i < 8; i++) seeded.push(await seedPhoto({ blobKey: `more-${i}` }));

    const result = await photoRepo().findPoolByCollection(collectionId, 6);

    expect(result).toHaveLength(6);
    expect(result.map((p) => p.id)).toEqual(seeded.slice(0, 6).map((p) => p.id));
  });

  it("returns exactly 6 when exactly 6 exist (off-by-one boundary)", async () => {
    const seeded = [];
    for (let i = 0; i < 6; i++) seeded.push(await seedPhoto({ blobKey: `exact-${i}` }));

    const result = await photoRepo().findPoolByCollection(collectionId, 6);

    expect(result).toHaveLength(6);
    expect(result.map((p) => p.id)).toEqual(seeded.map((p) => p.id));
  });

  it("returns fewer than the limit when fewer pooled photos exist", async () => {
    const seeded = [];
    for (let i = 0; i < 3; i++) seeded.push(await seedPhoto({ blobKey: `few-${i}` }));

    const result = await photoRepo().findPoolByCollection(collectionId, 6);

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(seeded.map((p) => p.id));
  });

  it("orders by created_at ASC (oldest first), matching /pool", async () => {
    const a = await seedPhoto({ blobKey: "ord-a" });
    const b = await seedPhoto({ blobKey: "ord-b" });
    const c = await seedPhoto({ blobKey: "ord-c" });

    const result = await photoRepo().findPoolByCollection(collectionId, 6);

    expect(result.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
  });

  it("breaks created_at ties by id ascending so a LIMIT is stable", async () => {
    const p1 = await seedPhoto({ blobKey: "tie-a" });
    const p2 = await seedPhoto({ blobKey: "tie-b" });
    // force identical created_at so ONLY the id tiebreaker can order them
    const tie = new Date(Date.UTC(2026, 5, 1, 0, 0, 0)).toISOString();
    const { db } = getTestDb();
    await db.execute(
      sql`UPDATE photos SET created_at = ${tie}::timestamptz WHERE id IN (${p1.id}, ${p2.id})`,
    );

    const result = await photoRepo().findPoolByCollection(collectionId, 1);

    const expectedFirst = [p1.id, p2.id].sort()[0];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(expectedFirst);
  });

  it("excludes soft-deleted pooled photos", async () => {
    const live = await seedPhoto({ blobKey: "live" });
    const dead = await seedPhoto({ blobKey: "dead", deleted: true });

    const ids = (await photoRepo().findPoolByCollection(collectionId, 6)).map((p) => p.id);

    expect(ids).toContain(live.id);
    expect(ids).not.toContain(dead.id);
  });

  it("excludes assigned photos (item_id set)", async () => {
    const item = await itemRepo().create({ collectionId });
    const pooled = await seedPhoto({ blobKey: "pooled" });
    const assigned = await seedPhoto({ blobKey: "assigned", itemId: item.id });

    const ids = (await photoRepo().findPoolByCollection(collectionId, 6)).map((p) => p.id);

    expect(ids).toContain(pooled.id);
    expect(ids).not.toContain(assigned.id);
  });

  it("excludes pooled photos from other collections", async () => {
    const mine = await seedPhoto({ blobKey: "mine" });
    const foreign = await seedPhoto({ blobKey: "foreign", collection: otherCollectionId });

    const ids = (await photoRepo().findPoolByCollection(collectionId, 6)).map((p) => p.id);

    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(foreign.id);
  });

  it("builds a well-formed pool asset URL for a previewed photo", async () => {
    const p = await seedPhoto({ blobKey: "url" });

    const [preview] = await photoRepo().findPoolByCollection(collectionId, 6);

    expect(preview.id).toBe(p.id);
    expect(getPoolPhotoAssetUrl(preview.collectionId, preview.id)).toBe(
      `/api/collections/${collectionId}/pool/photos/${p.id}/file`,
    );
  });

  it("returns the full ordered pool when no limit is passed (existing callers unchanged)", async () => {
    const seeded = [];
    for (let i = 0; i < 8; i++) seeded.push(await seedPhoto({ blobKey: `full-${i}` }));

    const result = await photoRepo().findPoolByCollection(collectionId);

    expect(result).toHaveLength(8);
    expect(result.map((p) => p.id)).toEqual(seeded.map((p) => p.id));
  });
});

describeDb("workspace item preview (repo -> DB)", () => {
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

  async function seedItem(number: number) {
    return itemRepo().create({ collectionId, number, name: `Item ${number}` });
  }

  async function seedItemWithPhoto(number: number) {
    const item = await seedItem(number);
    await photoRepo().create({
      itemId: item.id,
      collectionId,
      blobKey: `item-${number}`,
      filename: `item-${number}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: false,
    });
    return item;
  }

  beforeEach(async () => {
    await resetDb();
    userId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_workspace_items";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${userId}, 'Workspace items test', 'active', now(), now())
    `);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns only the preview slice in number ASC order", async () => {
    // seed out of insertion order to prove ordering is by number, not insert order
    for (const n of [5, 1, 3, 12, 8, 2, 15, 4, 6, 10, 7, 9, 11, 13, 14]) {
      await seedItem(n);
    }

    const result = await itemRepo().findByCollection(collectionId, {
      limit: 12,
      orderBy: "number",
    });

    expect(result).toHaveLength(12);
    expect(result.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("breaks number ties by id ascending (number is nullable, so it can't order alone)", async () => {
    const { db } = getTestDb();
    // Two items with NULL number — the UNIQUE(collection_id, number) index permits
    // multiple NULLs in Postgres, so ONLY the id tiebreaker can order them. This is
    // the case create()'s assign-a-number invariant doesn't cover at the DB level.
    await db.execute(sql`
      INSERT INTO items (id, collection_id, number, created_at, updated_at)
      VALUES
        ('item_zzz', ${collectionId}, NULL, now(), now()),
        ('item_aaa', ${collectionId}, NULL, now(), now())
    `);

    const result = await itemRepo().findByCollection(collectionId, {
      limit: 12,
      orderBy: "number",
    });

    expect(result.map((i) => i.id)).toEqual(["item_aaa", "item_zzz"]);
  });

  it("resolves covers only for the displayed item ids via findCoverPhotosByItemIds", async () => {
    const items = [];
    for (let n = 1; n <= 14; n++) items.push(await seedItemWithPhoto(n));

    const preview = await itemRepo().findByCollection(collectionId, {
      limit: 12,
      orderBy: "number",
    });
    const previewIds = preview.map((i) => i.id);

    const covers = await photoRepo().findCoverPhotosByItemIds(previewIds);

    // every displayed item resolved a cover; no cover key outside the slice
    expect([...covers.keys()].sort()).toEqual([...previewIds].sort());
    const excluded = items.filter((i) => (i.number ?? 0) > 12).map((i) => i.id);
    for (const id of excluded) expect(covers.has(id)).toBe(false);
  });

  it("returns all items unchanged when no options are passed (existing callers)", async () => {
    for (const n of [3, 1, 2]) await seedItem(n);

    const result = await itemRepo().findByCollection(collectionId);

    expect(result).toHaveLength(3);
  });
});
