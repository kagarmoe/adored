import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import type { SortResult, SortResultStatus } from "@/types";
import { generateId } from "@/lib/id";
import { allocateWithRetry } from "../allocateWithRetry";
import { isUniqueViolation } from "../pg-conflict";

export class SortResultRepository {
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
    return allocateWithRetry(async () => {
      const number = await this.getNextResultNumber(data.collectionId);
      return this.insertWithNumber({ ...data, number });
    }, isResultNumberConflict);
  }

  async findById(id: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.id, id));
    return result ? this.mapToResult(result) : null;
  }

  // Read + row-lock (SELECT ... FOR UPDATE) so a concurrent finalize and a
  // re-rank/reset serialize on the sort_results row. MUST be called inside a
  // transaction (the lock is held until commit); use to re-assert draft status
  // in the same tx as the manual-overlay write (finalized-immutability TOCTOU).
  async findByIdForUpdate(id: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.id, id))
      .for("update");
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
      )
      .orderBy(desc(sortResultsTable.createdAt), desc(sortResultsTable.id))
      .limit(1);
    return result ? this.mapToResult(result) : null;
  }

  // The curator's open draft for the collection, row-locked. Callers hold the
  // (collection, curator) advisory lock, so this is the only draft writer at a time.
  // Newest first: a legacy pair of drafts (pre-0003) resolves to the newer one.
  async findDraftForUpdate(collectionId: string, curatorId: string): Promise<SortResult | null> {
    const [row] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.curatorId, curatorId),
          eq(sortResultsTable.status, "draft"),
        ),
      )
      .orderBy(desc(sortResultsTable.createdAt), desc(sortResultsTable.id))
      .limit(1)
      .for("update");
    return row ? this.mapToResult(row) : null;
  }

  async findDrafts(collectionId: string, curatorId: string): Promise<SortResult[]> {
    const rows = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.curatorId, curatorId),
          eq(sortResultsTable.status, "draft"),
        ),
      );
    return rows.map((r) => this.mapToResult(r));
  }

  async findBySaveKey(curatorId: string, saveKey: string): Promise<SortResult | null> {
    const [row] = await this.db
      .select()
      .from(sortResultsTable)
      .where(and(eq(sortResultsTable.curatorId, curatorId), eq(sortResultsTable.saveKey, saveKey)));
    return row ? this.mapToResult(row) : null;
  }

  // Save-and-share's finalize: name, status, timestamp and the idempotency key in one write.
  async markSaved(id: string, name: string, saveKey: string): Promise<SortResult> {
    const now = new Date();
    const [row] = await this.db
      .update(sortResultsTable)
      .set({ name, saveKey, status: "finalized", finalizedAt: now, updatedAt: now })
      .where(eq(sortResultsTable.id, id))
      .returning();
    return this.mapToResult(row);
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

  private mapToResult(row: typeof sortResultsTable.$inferSelect): SortResult {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      number: row.number,
      status: row.status as SortResultStatus,
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
  return isUniqueViolation(error, "sort_results_collection_number_unique");
}
