import { eq, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import type { ISortResultRepository } from "../SortResultRepository";
import type { SortResult } from "@/types";
import { generateId } from "@/lib/id";

export class SortResultRepository implements ISortResultRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
  }): Promise<SortResult> {
    const base = {
      id: data.id || generateId("result"),
      collectionId: data.collectionId,
      curatorId: data.curatorId,
      name: data.name,
      status: data.status,
      createdAt: new Date(),
      updatedAt: new Date(),
      finalizedAt: null,
    };

    // Auto-allocate MAX+1, retry on the UNIQUE(collection_id, number) race
    // (neon-http is stateless — no long transaction to lock the max). Any other
    // unique violation surfaces, not retried.
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextResultNumber(data.collectionId);
      try {
        const [result] = await this.db
          .insert(sortResultsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToResult(result);
      } catch (error) {
        if (isResultNumberConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a result number");
  }

  async findById(id: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.id, id));
    return result ? this.mapToResult(result) : null;
  }

  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<SortResult | null> {
    // sort_results has no deletedAt — filter only by collectionId + number
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.number, number),
        ),
      );
    return result ? this.mapToResult(result) : null;
  }

  async getNextResultNumber(collectionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${sortResultsTable.number})` })
      .from(sortResultsTable)
      .where(eq(sortResultsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
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
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sortResultsTable.id, id))
      .returning();
    return this.mapToResult(result);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sortResultsTable).where(eq(sortResultsTable.id, id));
  }

  private mapToResult(row: any): SortResult {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      number: row.number ?? null,
      status: row.status as "draft" | "finalized",
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finalizedAt: row.finalizedAt,
    };
  }
}

function isResultNumberConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(collection_id, number) race — any other unique
  // violation is a real condition and must surface.
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  return code === "23505" && message.includes("sort_results_collection_number_unique");
}
