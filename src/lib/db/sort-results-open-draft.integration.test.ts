// @vitest-environment node
// Migration 0003 (spec §6): at most ONE open draft per (collection, curator). The
// service never relies on this to serialize — it holds the (collection, curator)
// advisory lock — the index is the backstop that makes a second draft impossible.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { sortResultItemsTable, sortResultsTable } from "@/lib/db/schema";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { isUniqueViolation } from "@/server/repositories/pg-conflict";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("sort_results: one open draft per (collection, curator)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("rejects a second draft for the same collection and curator", async () => {
    const repo = new SortResultRepository(getTestDb().db);
    const collectionId = await seedBareCollection(ownerId);
    await repo.create({ collectionId, curatorId: ownerId, name: "Open", status: "draft" });
    await expect(
      repo.create({ collectionId, curatorId: ownerId, name: "Second", status: "draft" }),
    ).rejects.toSatisfy((e: unknown) => isUniqueViolation(e, "sort_results_open_draft_unique"));
  });

  it("leaves saved rankings, other curators and other collections alone", async () => {
    const repo = new SortResultRepository(getTestDb().db);
    const collectionId = await seedBareCollection(ownerId);
    const elsewhere = await seedBareCollection(ownerId);
    const otherCurator = await seedUserRow("open-draft-other");
    await repo.create({ collectionId, curatorId: ownerId, name: "Saved", status: "finalized" });
    await repo.create({ collectionId, curatorId: ownerId, name: "Saved again", status: "finalized" });
    await repo.create({ collectionId, curatorId: ownerId, name: "Open", status: "draft" });
    await repo.create({ collectionId, curatorId: otherCurator, name: "Theirs", status: "draft" });
    await repo.create({ collectionId: elsewhere, curatorId: ownerId, name: "Elsewhere", status: "draft" });
    expect(await repo.findByCollection(collectionId)).toHaveLength(4);
  });

  // A partial unique index rejects duplicates exactly like a plain one, so the
  // insert/reject test above cannot tell them apart; only indexdef proves the predicate.
  it("both new unique indexes are partial", async () => {
    const rows = await getTestDb().db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'sort_results'
        AND indexname IN ('sort_results_open_draft_unique', 'sort_results_save_key_unique')
      ORDER BY indexname`);
    expect(rows.map((r) => [r.indexname, r.indexdef.replace(/^.* USING btree /, "")])).toEqual([
      ["sort_results_open_draft_unique", "(collection_id, curator_id) WHERE (status = 'draft'::text)"],
      ["sort_results_save_key_unique", "(curator_id, save_key) WHERE (save_key IS NOT NULL)"],
    ]);
  });

  // The 0003 data step on real rows: window function + partial unique index. The test
  // runs the migration FILE's own statements, so the shipped SQL is what is proven.
  it("0003's data step keeps the newest open draft per (collection, curator) and the index then builds", async () => {
    const { db } = getTestDb();
    const file = readdirSync("drizzle").find((f) => f.startsWith("0003_"))!;
    const statements = readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint");
    const dedupe = statements.filter((q) => q.includes("row_number()"));
    const index = statements.find((q) => q.includes('CREATE UNIQUE INDEX "sort_results_open_draft_unique"'))!;
    expect(dedupe.length).toBeGreaterThan(0);

    const collectionId = await seedBareCollection(ownerId);
    const elsewhere = await seedBareCollection(ownerId);
    const otherCurator = await seedUserRow("open-draft-dedupe-other");
    const item = await new ItemRepository(db).create({ collectionId, name: "Piece" });
    const at = (n: number) => new Date(Date.UTC(2026, 0, n));
    const row = (id: string, cId: string, curatorId: string, number: number, status: string, day: number) =>
      ({ id, collectionId: cId, curatorId, number, status, name: id, createdAt: at(day), updatedAt: at(day) });

    try {
      await db.execute(sql`DROP INDEX IF EXISTS sort_results_open_draft_unique`);
      await db.insert(sortResultsTable).values([
        row("d1", collectionId, ownerId, 1, "draft", 1),
        row("d2", collectionId, ownerId, 2, "draft", 2),
        row("d3", collectionId, ownerId, 3, "draft", 3),
        row("theirs", collectionId, otherCurator, 4, "draft", 1),
        row("away", elsewhere, ownerId, 1, "draft", 1),
        row("saved", collectionId, ownerId, 5, "finalized", 1),
      ]);
      await db.insert(sortResultItemsTable).values(
        ["d1", "d3", "saved"].map((sortResultId) => ({
          id: `sri-${sortResultId}`, sortResultId, itemId: item.id, computedRank: 0, computedBucket: "top",
        })),
      );

      for (const q of dedupe) await db.execute(sql.raw(q));
      await db.execute(sql.raw(index)); // building is the real assertion

      const ids = (await db.select({ id: sortResultsTable.id }).from(sortResultsTable)).map((r) => r.id).sort();
      expect(ids).toEqual(["away", "d3", "saved", "theirs"]);
      const kept = await db.select().from(sortResultItemsTable).where(eq(sortResultItemsTable.sortResultId, "d3"));
      expect(kept).toHaveLength(1); // the newest draft keeps its rows
      expect(await db.select().from(sortResultItemsTable)).toHaveLength(2); // d1's row went with d1; saved's stays
    } finally {
      await resetDb();
      await db.execute(sql.raw(index.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS")));
    }
  });
});
