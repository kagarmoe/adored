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
