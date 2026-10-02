import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("result number allocation (repo -> DB)", () => {
  async function seedOwner() {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO "user" (id, name, email) VALUES ('u_r', 'T', 'r@t.dev')
      ON CONFLICT (id) DO NOTHING
    `);
  }
  async function newCollection() {
    return new CollectionRepository(getTestDb().db).create({ id: generateId("coll"), ownerId: "u_r", name: "Results" });
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("assigns sequential per-collection numbers and resolves them", async () => {
    const { db } = getTestDb();
    const c = await newCollection();
    const repo = new SortResultRepository(db);
    const r1 = await repo.create({ collectionId: c.id, curatorId: "u_r", name: "A", status: "draft" });
    const r2 = await repo.create({ collectionId: c.id, curatorId: "u_r", name: "B", status: "finalized" });
    expect([r1.number, r2.number]).toEqual([1, 2]);
    expect((await repo.findByCollectionAndNumber(c.id, 2))?.id).toBe(r2.id);
    expect(await repo.findByCollectionAndNumber(c.id, 3)).toBeNull();

    const other = await newCollection();
    const r3 = await repo.create({ collectionId: other.id, curatorId: "u_r", name: "C", status: "draft" });
    expect(r3.number).toBe(1);
  });
});
