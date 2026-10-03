import { eq, and, inArray, count } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultItemsTable, sortResultsTable } from "@/lib/db/schema";
import type { SortResultItem, RankBucket, UsageResult } from "@/types";
import { generateId } from "@/lib/id";

export type NewSortResultItem = {
  sortResultId: string;
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
  manualRank?: number | null;
  usage?: "uses" | "not_uses" | null;
};

export class SortResultItemRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    sortResultId: string;
    itemId: string;
    computedRank: number;
    computedBucket: "top" | "high" | "medium" | "low";
    // Epic S: usage standing stamped by the materialization step (deriveUsage's
    // typed output guards the value). Absent/undefined → NULL ("unknown").
    usage?: "uses" | "not_uses" | null;
  }): Promise<SortResultItem> {
    const id = data.id || generateId("sri");
    const [item] = await this.db
      .insert(sortResultItemsTable)
      .values({
        id,
        sortResultId: data.sortResultId,
        itemId: data.itemId,
        computedRank: data.computedRank,
        computedBucket: data.computedBucket,
        manualRank: null,
        manualBucket: null,
        usage: data.usage ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return this.mapToResultItem(item);
  }

  // One INSERT for a whole materialization (the per-row loop held the curator lock N round trips).
  // 10 bind params per row against Postgres's 65,535 cap: fine up to ~6,553 rows per call.
  async createMany(rows: NewSortResultItem[]): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await this.db
      .insert(sortResultItemsTable)
      .values(
        rows.map((r) => ({
          id: generateId("sri"),
          sortResultId: r.sortResultId,
          itemId: r.itemId,
          computedRank: r.computedRank,
          computedBucket: r.computedBucket,
          manualRank: r.manualRank ?? null,
          manualBucket: null,
          usage: r.usage ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      );
  }

  async findById(id: string): Promise<SortResultItem | null> {
    const [item] = await this.db
      .select()
      .from(sortResultItemsTable)
      .where(eq(sortResultItemsTable.id, id));
    return item ? this.mapToResultItem(item) : null;
  }

  async findByResult(sortResultId: string): Promise<SortResultItem[]> {
    const items = await this.db
      .select()
      .from(sortResultItemsTable)
      .where(eq(sortResultItemsTable.sortResultId, sortResultId));
    return items.map((i) => this.mapToResultItem(i));
  }

  async findByResultAndItem(sortResultId: string, itemId: string): Promise<SortResultItem | null> {
    const [row] = await this.db
      .select()
      .from(sortResultItemsTable)
      .where(and(eq(sortResultItemsTable.sortResultId, sortResultId), eq(sortResultItemsTable.itemId, itemId)));
    return row ? this.mapToResultItem(row) : null;
  }

  async update(id: string, data: Partial<SortResultItem>): Promise<SortResultItem> {
    const [item] = await this.db
      .update(sortResultItemsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(sortResultItemsTable.id, id))
      .returning();
    return this.mapToResultItem(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sortResultItemsTable).where(eq(sortResultItemsTable.id, id));
  }

  async deleteByResult(sortResultId: string): Promise<void> {
    await this.db
      .delete(sortResultItemsTable)
      .where(eq(sortResultItemsTable.sortResultId, sortResultId));
  }

  // Delete every result-item of this collection's results (result-items have no
  // collection_id — scope via the parent sort_results). Purge-only.
  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(sortResultItemsTable).where(
      inArray(
        sortResultItemsTable.sortResultId,
        this.db
          .select({ id: sortResultsTable.id })
          .from(sortResultsTable)
          .where(eq(sortResultsTable.collectionId, collectionId)),
      ),
    );
  }

  // Delete every result-item whose parent sort_result belongs to the given curator.
  // Child-first prerequisite for deleteByCurator on sort_results. Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(sortResultItemsTable).where(
      inArray(
        sortResultItemsTable.sortResultId,
        this.db
          .select({ id: sortResultsTable.id })
          .from(sortResultsTable)
          .where(eq(sortResultsTable.curatorId, curatorId)),
      ),
    );
  }

  // True iff ANY sort_result_item references the item (any result, any status).
  // The purge 409 guard. LIMIT 1 — existence only.
  async existsByItem(itemId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sortResultItemsTable.id })
      .from(sortResultItemsTable)
      .where(eq(sortResultItemsTable.itemId, itemId))
      .limit(1);
    return row != null;
  }

  // Delete the item's result-items that belong to DRAFT results; returns the
  // affected-row count (postgres-js rowCount). Owner-only purge-prep — finalized
  // results are never matched. Mirrors: DELETE ... WHERE item_id=$1 AND
  // sort_result_id IN (SELECT id FROM sort_results WHERE status='draft').
  async deleteByItemInDraftResults(itemId: string): Promise<number> {
    // RETURNING ids and counting them is driver-agnostic (postgres-js exposes
    // affected-row count inconsistently across the drizzle delete result shape).
    const deleted = await this.db
      .delete(sortResultItemsTable)
      .where(
        and(
          eq(sortResultItemsTable.itemId, itemId),
          inArray(
            sortResultItemsTable.sortResultId,
            this.db
              .select({ id: sortResultsTable.id })
              .from(sortResultsTable)
              .where(eq(sortResultsTable.status, "draft")),
          ),
        ),
      )
      .returning({ id: sortResultItemsTable.id });
    return deleted.length;
  }

  // Count the item's result-items whose parent result is FINALIZED.
  async countByItemInFinalizedResults(itemId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(sortResultItemsTable)
      .innerJoin(
        sortResultsTable,
        eq(sortResultItemsTable.sortResultId, sortResultsTable.id),
      )
      .where(
        and(
          eq(sortResultItemsTable.itemId, itemId),
          eq(sortResultsTable.status, "finalized"),
        ),
      );
    return row?.n ?? 0;
  }

  private mapToResultItem(row: typeof sortResultItemsTable.$inferSelect): SortResultItem {
    return {
      id: row.id,
      sortResultId: row.sortResultId,
      itemId: row.itemId,
      computedRank: row.computedRank,
      computedBucket: row.computedBucket as RankBucket,
      manualRank: row.manualRank,
      manualBucket: row.manualBucket as RankBucket | null,
      usage: row.usage as UsageResult | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
