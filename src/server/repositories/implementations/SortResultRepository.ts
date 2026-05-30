import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultsTable, sortResultItemsTable } from "@/lib/db/schema";
import type {
  ISortResultRepository,
  ISortResultItemRepository,
} from "../SortResultRepository";
import type { SortResult, SortResultItem } from "@/types";

export class SortResultRepository implements ISortResultRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
  }): Promise<SortResult> {
    const id = data.id || `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const [result] = await this.db
      .insert(sortResultsTable)
      .values({
        id,
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        name: data.name,
        status: data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
        finalizedAt: null,
      })
      .returning();
    return this.mapToResult(result);
  }

  async findById(id: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.id, id));
    return result ? this.mapToResult(result) : null;
  }

  async findByCollection(collectionId: string): Promise<SortResult[]> {
    const results = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.collectionId, collectionId));
    return results.map((r) => this.mapToResult(r));
  }

  async findDraft(collectionId: string, curatorId: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.curatorId, curatorId),
          eq(sortResultsTable.status, "draft"),
        ),
      );
    return result ? this.mapToResult(result) : null;
  }

  async update(id: string, data: Partial<SortResult>): Promise<SortResult> {
    const [result] = await this.db
      .update(sortResultsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(sortResultsTable.id, id))
      .returning();
    return this.mapToResult(result);
  }

  private mapToResult(row: any): SortResult {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      status: row.status as "draft" | "finalized",
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finalizedAt: row.finalizedAt,
    };
  }
}

export class SortResultItemRepository implements ISortResultItemRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    sortResultId: string;
    itemId: string;
    computedRank: number;
    computedBucket: "top" | "high" | "medium" | "low";
  }): Promise<SortResultItem> {
    const id = data.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
