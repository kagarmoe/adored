import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultSharesTable, sortResultsTable } from "@/lib/db/schema";
import type { SortResultShare, ShareStatus } from "@/types";
import { generateId } from "@/lib/id";

export class SortResultShareRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    sortResultId: string;
    shareToken: string;
    expiresAt?: Date;
  }): Promise<SortResultShare> {
    const id = data.id || generateId("share");
    const [share] = await this.db
      .insert(sortResultSharesTable)
      .values({
        id,
        sortResultId: data.sortResultId,
        shareToken: data.shareToken,
        status: "active",
        expiresAt: data.expiresAt || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return this.mapToShare(share);
  }

  async findById(id: string): Promise<SortResultShare | null> {
    const [share] = await this.db
      .select()
      .from(sortResultSharesTable)
      .where(eq(sortResultSharesTable.id, id));
    return share ? this.mapToShare(share) : null;
  }

  async findByToken(token: string): Promise<SortResultShare | null> {
    const [share] = await this.db
      .select()
      .from(sortResultSharesTable)
      .where(eq(sortResultSharesTable.shareToken, token));
    return share ? this.mapToShare(share) : null;
  }

  async findByResult(sortResultId: string): Promise<SortResultShare[]> {
    const shares = await this.db
      .select()
      .from(sortResultSharesTable)
      .where(eq(sortResultSharesTable.sortResultId, sortResultId));
    return shares.map((s) => this.mapToShare(s));
  }

  async update(id: string, data: Partial<SortResultShare>): Promise<SortResultShare> {
    const [share] = await this.db
      .update(sortResultSharesTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(sortResultSharesTable.id, id))
      .returning();
    return this.mapToShare(share);
  }

  // Delete every share of this collection's results (shares have no collection_id —
  // scope via the parent sort_results). Purge-only.
  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(sortResultSharesTable).where(
      inArray(
        sortResultSharesTable.sortResultId,
        this.db
          .select({ id: sortResultsTable.id })
          .from(sortResultsTable)
          .where(eq(sortResultsTable.collectionId, collectionId)),
      ),
    );
  }

  // Delete every share whose parent sort_result belongs to the given curator.
  // Child-first prerequisite for deleteByCurator on sort_results. Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(sortResultSharesTable).where(
      inArray(
        sortResultSharesTable.sortResultId,
        this.db
          .select({ id: sortResultsTable.id })
          .from(sortResultsTable)
          .where(eq(sortResultsTable.curatorId, curatorId)),
      ),
    );
  }

  private mapToShare(row: typeof sortResultSharesTable.$inferSelect): SortResultShare {
    return {
      id: row.id,
      sortResultId: row.sortResultId,
      shareToken: row.shareToken,
      status: row.status as ShareStatus,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
