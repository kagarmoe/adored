import { eq, and } from "drizzle-orm";
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
    const id = data.id || generateId("result");
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
