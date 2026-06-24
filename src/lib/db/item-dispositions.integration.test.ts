// Un-mocked DB-integration proof for ItemDispositionRepository: real repo ->
// ephemeral Postgres (migration 0008's item_dispositions table). Mocks ONLY the
// getDb boundary -> the test db. Proves upsert read-back, the UNIQUE(item,curator)
// switch-in-place, and idempotent delete.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import {
  DispositionController,
  PreferenceExistsError,
} from "@/server/api/dispositions";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("ItemDispositionRepository", () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  async function seedItem() {
    const { db } = getTestDb();
    const curatorId = await seedBaseline();
    const collectionId = await seedBareCollection(curatorId);
    const item = await new ItemRepository(db).create({ collectionId, name: "A" });
    return { db, curatorId, collectionId, itemId: item.id };
  }

  it("upserts a disposition and reads it back by collection+curator", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId, disposition: "deferred" });
    const all = await repo.findByCollectionAndCurator(collectionId, curatorId);
    expect(all).toHaveLength(1);
    expect(all[0].disposition).toBe("deferred");
  });

  it("upsert switches disposition in place (one row, UNIQUE(item,curator))", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId, disposition: "deferred" });
    await repo.upsert({ collectionId, curatorId, itemId, disposition: "set_aside" });
    const all = await repo.findByCollectionAndCurator(collectionId, curatorId);
    expect(all).toHaveLength(1);
    expect(all[0].disposition).toBe("set_aside");
  });

  it("delete is idempotent: removes the row, returns 0 when absent", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const repo = new ItemDispositionRepository(db);
    await repo.upsert({ collectionId, curatorId, itemId, disposition: "deferred" });
    expect(await repo.delete(itemId, curatorId)).toBe(1);
    expect(await repo.delete(itemId, curatorId)).toBe(0);
    expect(await repo.findByCollectionAndCurator(collectionId, curatorId)).toHaveLength(0);
  });
});

describeDb("DispositionController", () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());

  async function seedItem() {
    const { db } = getTestDb();
    const curatorId = await seedBaseline();
    const collectionId = await seedBareCollection(curatorId);
    const item = await new ItemRepository(db).create({ collectionId, name: "A" });
    return { db, curatorId, collectionId, itemId: item.id };
  }

  it("setDisposition with NO preference succeeds and creates the row", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const ctrl = DispositionController.fromDb(db);
    const disp = await ctrl.setDisposition(collectionId, curatorId, {
      itemId,
      disposition: "deferred",
    });
    expect(disp.disposition).toBe("deferred");
    const all = await new ItemDispositionRepository(db).findByCollectionAndCurator(
      collectionId,
      curatorId,
    );
    expect(all).toHaveLength(1);
    expect(all[0].itemId).toBe(itemId);
  });

  it("setDisposition rejects an item that already has a preference (disposed<=>untriaged)", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    // create a preference row for the item (simulate it was triaged)
    await new CollectionPreferenceItemRepository(db).create({
      collectionId,
      curatorId,
      itemId,
      score: 0.5,
      confidence: 0,
      rankBucket: "medium",
      comparisonCount: 1,
    });
    const ctrl = DispositionController.fromDb(db);
    await expect(
      ctrl.setDisposition(collectionId, curatorId, { itemId, disposition: "deferred" }),
    ).rejects.toBeInstanceOf(PreferenceExistsError);
    // invariant held: no disposition row was written
    const all = await new ItemDispositionRepository(db).findByCollectionAndCurator(
      collectionId,
      curatorId,
    );
    expect(all).toHaveLength(0);
  });

  it("listDispositions filters by disposition when given", async () => {
    const { db, curatorId, collectionId } = await seedItem();
    const a = await new ItemRepository(db).create({ collectionId, name: "set-aside-item" });
    const b = await new ItemRepository(db).create({ collectionId, name: "deferred-item" });
    const ctrl = DispositionController.fromDb(db);
    await ctrl.setDisposition(collectionId, curatorId, { itemId: a.id, disposition: "set_aside" });
    await ctrl.setDisposition(collectionId, curatorId, { itemId: b.id, disposition: "deferred" });

    expect(await ctrl.listDispositions(collectionId, curatorId)).toHaveLength(2);
    const setAside = await ctrl.listDispositions(collectionId, curatorId, "set_aside");
    expect(setAside).toHaveLength(1);
    expect(setAside[0].itemId).toBe(a.id);
  });

  it("bringBack removes the disposition and is idempotent (returns 0 when absent)", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const ctrl = DispositionController.fromDb(db);
    await ctrl.setDisposition(collectionId, curatorId, { itemId, disposition: "set_aside" });
    expect(await ctrl.bringBack(itemId, curatorId)).toBe(1);
    expect(await ctrl.bringBack(itemId, curatorId)).toBe(0);
    expect(await ctrl.listDispositions(collectionId, curatorId)).toHaveLength(0);
  });

  it("setDisposition rejects an invalid disposition value (Zod boundary)", async () => {
    const { db, curatorId, collectionId, itemId } = await seedItem();
    const ctrl = DispositionController.fromDb(db);
    await expect(
      ctrl.setDisposition(collectionId, curatorId, { itemId, disposition: "discarded" }),
    ).rejects.toThrow();
  });
});
