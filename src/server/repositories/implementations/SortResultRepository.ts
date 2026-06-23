import { eq, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import type { ISortResultRepository } from "../SortResultRepository";
import type { SortResult } from "@/types";
import { generateId } from "@/lib/id";

export class SortResultRepository implements ISortResultRepository {
  constructor(private db: Database) {}

  // Single INSERT with a caller-supplied number; NO recompute, NO retry. The
  // number race is handled by callers (create's wrapper, or the service's
  // whole-transaction retry) so the two retry sites share one predicate.
  async insertWithNumber(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
    number: number;
  }): Promise<SortResult> {
    const [result] = await this.db
      .insert(sortResultsTable)
      .values({
        id: data.id || generateId("result"),
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        name: data.name,
        status: data.status,
        number: data.number,
        createdAt: new Date(),
        updatedAt: new Date(),
        finalizedAt: null,
      })
      .returning();
    return this.mapToResult(result);
  }

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
  }): Promise<SortResult> {
    // Auto-allocate MAX+1, recomputing the number EACH attempt, retrying only
    // on the UNIQUE(collection_id, number) race. postgres-js autocommits each
    // statement here, so a conflicting INSERT can be retried in place. Any
    // other unique violation surfaces, not retried.
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextResultNumber(data.collectionId);
      try {
        return await this.insertWithNumber({ ...data, number });
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

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(sortResultsTable).where(eq(sortResultsTable.collectionId, collectionId));
  }

  // Delete every sort_result belonging to the given curator (across all collections).
  // Caller must have already deleted child sort_result_shares and sort_result_items.
  // Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(sortResultsTable).where(eq(sortResultsTable.curatorId, curatorId));
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

export function isResultNumberConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(collection_id, number) race — any other unique
  // violation is a real condition and must surface.
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  return code === "23505" && message.includes("sort_results_collection_number_unique");
}
