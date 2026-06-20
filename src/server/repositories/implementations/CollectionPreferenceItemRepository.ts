import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { preferencesTable } from "@/lib/db/schema";
import type { ICollectionPreferenceItemRepository } from "../CollectionPreferenceItemRepository";
import type { CollectionPreferenceItem } from "@/types";
import { generateId } from "@/lib/id";

export class CollectionPreferenceItemRepository
  implements ICollectionPreferenceItemRepository
{
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    itemId: string;
    score: number;
    confidence: number;
    rankBucket: "top" | "high" | "medium" | "low";
    comparisonCount: number;
  }): Promise<CollectionPreferenceItem> {
    const id = data.id || generateId("pref");
    const [pref] = await this.db
      .insert(preferencesTable)
      .values({
        id,
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        itemId: data.itemId,
        score: data.score.toString(),
        confidence: data.confidence.toString(),
        rankBucket: data.rankBucket,
        comparisonCount: data.comparisonCount,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return this.mapToPreference(pref);
  }

  async findById(id: string): Promise<CollectionPreferenceItem | null> {
    const [pref] = await this.db
      .select()
      .from(preferencesTable)
      .where(eq(preferencesTable.id, id));
    return pref ? this.mapToPreference(pref) : null;
  }

  async findByItem(itemId: string, curatorId: string): Promise<CollectionPreferenceItem | null> {
    const [pref] = await this.db
      .select()
      .from(preferencesTable)
      .where(and(eq(preferencesTable.itemId, itemId), eq(preferencesTable.curatorId, curatorId)));
    return pref ? this.mapToPreference(pref) : null;
  }

  async findByCollection(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    const prefs = await this.db
      .select()
      .from(preferencesTable)
      .where(
        and(
          eq(preferencesTable.collectionId, collectionId),
          eq(preferencesTable.curatorId, curatorId),
        ),
      );
    return prefs.map((p) => this.mapToPreference(p));
  }

  async update(id: string, data: Partial<CollectionPreferenceItem>): Promise<CollectionPreferenceItem> {
    const updateData: any = { ...data };
    if (data.score !== undefined) {
      updateData.score = data.score.toString();
    }
    if (data.confidence !== undefined) {
      updateData.confidence = data.confidence.toString();
    }
    updateData.updatedAt = new Date();

    const [pref] = await this.db
      .update(preferencesTable)
      .set(updateData)
      .where(eq(preferencesTable.id, id))
      .returning();
    return this.mapToPreference(pref);
  }

  async clear(collectionId: string, curatorId: string): Promise<void> {
    await this.db
      .delete(preferencesTable)
      .where(
        and(
          eq(preferencesTable.collectionId, collectionId),
          eq(preferencesTable.curatorId, curatorId),
        ),
      );
  }

  // Permanently DELETE every preference row for an item, across ALL curators
  // (distinct from clear, which is collection+curator-scoped). Returns the
  // affected count via RETURNING (postgres-js exposes delete rowCount
  // inconsistently — mirrors SortResultItemRepository.deleteByItemInDraftResults).
  // Purge-only.
  async deleteByItem(itemId: string): Promise<number> {
    const deleted = await this.db
      .delete(preferencesTable)
      .where(eq(preferencesTable.itemId, itemId))
      .returning({ id: preferencesTable.id });
    return deleted.length;
  }

  private mapToPreference(row: any): CollectionPreferenceItem {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      itemId: row.itemId,
      score: parseFloat(row.score),
      confidence: parseFloat(row.confidence),
      rankBucket: row.rankBucket as "top" | "high" | "medium" | "low",
      comparisonCount: row.comparisonCount,
      lastSeen: row.lastSeen,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
