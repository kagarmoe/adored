import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultItemsTable } from "@/lib/db/schema";
import type { ISortResultItemRepository } from "../SortResultRepository";
import type { SortResultItem } from "@/types";
import { generateId } from "@/lib/id";

export class SortResultItemRepository implements ISortResultItemRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    sortResultId: string;
    itemId: string;
    computedRank: number;
    computedBucket: "top" | "high" | "medium" | "low";
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
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return this.mapToResultItem(item);
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

  private mapToResultItem(row: any): SortResultItem {
    return {
      id: row.id,
      sortResultId: row.sortResultId,
      itemId: row.itemId,
      computedRank: row.computedRank,
      computedBucket: row.computedBucket,
      manualRank: row.manualRank,
      manualBucket: row.manualBucket,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
