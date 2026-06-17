import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("session number allocation (repo -> DB)", () => {
  function seedOwner(id: string, email: string) {
    const { db } = getTestDb();
    return db.execute(sql`
      INSERT INTO "user" (id, name, email) VALUES (${id}, 'T', ${email})
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async function newCollection(ownerId: string) {
    return new CollectionRepository(getTestDb().db).create({
      id: generateId("coll"),
      ownerId,
      name: "Numbers",
    });
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("assigns sequential per-collection numbers starting at 1", async () => {
    await seedOwner("u_a", "a@t.dev");
    await seedOwner("u_b", "b@t.dev");
    const { db } = getTestDb();
    const collection = await newCollection("u_a");
    const repo = new SessionRepository(db);

    // sessions_active_unique caps one session per (collection, curator), so vary curators.
    const s1 = await repo.create({ collectionId: collection.id, curatorId: "u_a" });
    const s2 = await repo.create({ collectionId: collection.id, curatorId: "u_b" });
    expect(s1.number).toBe(1);
    expect(s2.number).toBe(2);

    // A second collection numbers independently.
    const other = await newCollection("u_a");
    const s3 = await repo.create({ collectionId: other.id, curatorId: "u_a" });
    expect(s3.number).toBe(1);
  });

  it("findByCollectionAndNumber resolves the right session and ignores soft-deleted", async () => {
    await seedOwner("u_a", "a@t.dev");
    const { db } = getTestDb();
    const collection = await newCollection("u_a");
    const repo = new SessionRepository(db);
    const s1 = await repo.create({ collectionId: collection.id, curatorId: "u_a" });

    expect((await repo.findByCollectionAndNumber(collection.id, 1))?.id).toBe(s1.id);
    expect(await repo.findByCollectionAndNumber(collection.id, 99)).toBeNull();

    await repo.softDelete(s1.id);
    expect(await repo.findByCollectionAndNumber(collection.id, 1)).toBeNull();
  });

  it("findByCollectionAndCurator returns only that curator's sessions in the collection (purses-t9l)", async () => {
    await seedOwner("u_a", "a@t.dev");
    await seedOwner("u_b", "b@t.dev");
    const { db } = getTestDb();
    const c1 = await newCollection("u_a");
    const c2 = await newCollection("u_a");
    const repo = new SessionRepository(db);
    const a1 = await repo.create({ collectionId: c1.id, curatorId: "u_a" });
    await repo.create({ collectionId: c1.id, curatorId: "u_b" }); // other curator, same collection
    await repo.create({ collectionId: c2.id, curatorId: "u_a" }); // same curator, other collection

    const mine = await repo.findByCollectionAndCurator(c1.id, "u_a");
    expect(mine.map((s) => s.id)).toEqual([a1.id]); // only u_a's session in c1

    await repo.softDelete(a1.id);
    expect(await repo.findByCollectionAndCurator(c1.id, "u_a")).toHaveLength(0);
  });
});
