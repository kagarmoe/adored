// @vitest-environment node
// Archive = soft delete. One real-DB crossing: the live read drops the item, the
// Archived read returns it, a saved ranking keeps its row, restore undoes it.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedSortScenario } from "../../../e2e/fixtures/seed";
import { sortResultItemsTable } from "@/lib/db/schema";
import { ItemController } from "@/server/api/items";
import { ItemSoftDeleteService } from "@/server/services/ItemService";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("archive (soft delete) across the live and archived reads", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("hides from the live list, appears under Archived, keeps saved-ranking rows, and restores", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const { collectionId, itemIds } = await seedSortScenario(ownerId);
    const items = ItemController.fromDb(db);
    const target = (await items.listItems(collectionId)).find((i) => i.id === itemIds[0])!;
    const rankingRows = () =>
      db.select().from(sortResultItemsTable).where(eq(sortResultItemsTable.itemId, target.id));
    const before = (await rankingRows()).length;
    expect(before).toBeGreaterThan(0);
    expect(await items.listArchived(collectionId)).toEqual([]);

    await ItemSoftDeleteService.fromDb(db).softDeleteWithAudit(target, ownerId);
    expect((await items.listItems(collectionId)).map((i) => i.id)).not.toContain(target.id);
    expect((await items.listArchived(collectionId)).map((i) => i.id)).toEqual([target.id]);
    expect((await rankingRows()).length).toBe(before);

    await items.restoreItem(target.id);
    expect((await items.listItems(collectionId)).map((i) => i.id)).toContain(target.id);
    expect(await items.listArchived(collectionId)).toEqual([]);
  });
});
