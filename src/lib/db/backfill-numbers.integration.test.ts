import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql, eq, asc } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { sessionsTable } from "@/lib/db/schema";
import { backfillTable } from "./backfill-numbers";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("backfillTable assigns 1..n per collection by createdAt", () => {
  async function seedOwner() {
    const { db } = getTestDb();
    await db.execute(sql`INSERT INTO "user" (id, name, email) VALUES ('u_bf','T','bf@t.dev') ON CONFLICT (id) DO NOTHING`);
    // Seed curator IDs used by rawSession — must satisfy the FK to "user"
    for (const [id, email] of [["c_1","c1@t.dev"],["c_2","c2@t.dev"],["c_3","c3@t.dev"],["c_4","c4@t.dev"]]) {
      await db.execute(sql`INSERT INTO "user" (id, name, email) VALUES (${id},'C',${email}) ON CONFLICT (id) DO NOTHING`);
    }
  }
  // Insert a session row directly with an explicit createdAt and NULL number.
  async function rawSession(collectionId: string, curatorId: string, createdAt: Date) {
    const { db } = getTestDb();
    await db.insert(sessionsTable).values({
      id: generateId("sess"), collectionId, curatorId, status: "active",
      goal: null, number: null, createdAt, updatedAt: createdAt, deletedAt: null,
    });
  }
  function numbersByCreatedAt(collectionId: string) {
    const { db } = getTestDb();
    return db.select({ number: sessionsTable.number })
      .from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId))
      .orderBy(asc(sessionsTable.createdAt));
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("numbers oldest-first, is idempotent, and continues past existing max", async () => {
    const { db } = getTestDb();
    const c = await new CollectionRepository(db).create({ id: generateId("coll"), ownerId: "u_bf", name: "BF" });
    // distinct curators (sessions_active_unique), staggered createdAt
    await rawSession(c.id, "c_3", new Date("2026-01-03"));
    await rawSession(c.id, "c_1", new Date("2026-01-01"));
    await rawSession(c.id, "c_2", new Date("2026-01-02"));

    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3]);

    // Idempotent: re-run changes nothing.
    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3]);

    // A new NULL-number row continues from max.
    await rawSession(c.id, "c_4", new Date("2026-01-04"));
    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });

  it("numbers sort_results oldest-first per collection (no deletedAt column)", async () => {
    const { db } = getTestDb();
    const { sortResultsTable } = await import("@/lib/db/schema");
    const c = await new CollectionRepository(db).create({ id: generateId("coll"), ownerId: "u_bf", name: "BF2" });
    const raw = (createdAt: Date, name: string) => db.insert(sortResultsTable).values({
      id: generateId("result"), collectionId: c.id, curatorId: "u_bf", status: "draft",
      name, number: null, createdAt, updatedAt: createdAt, finalizedAt: null,
    });
    await raw(new Date("2026-02-02"), "B");
    await raw(new Date("2026-02-01"), "A");
    await backfillTable(db, sortResultsTable);
    const rows = await db.select({ number: sortResultsTable.number, name: sortResultsTable.name })
      .from(sortResultsTable).where(eq(sortResultsTable.collectionId, c.id)).orderBy(asc(sortResultsTable.createdAt));
    expect(rows.map((r) => r.number)).toEqual([1, 2]); // A (older) = 1, B = 2
  });
});
