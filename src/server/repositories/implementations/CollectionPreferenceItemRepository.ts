import { eq, and, sql } from "drizzle-orm";
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
    orderRank?: number | null;
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
        orderRank: data.orderRank ?? null,
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

  // ONE upsert statement for the whole recomputed set. Conflict target is the
  // (item_id, curator_id) unique index (preferences_item_curator_unique). Callers
  // MUST clearOrderRanks first: because the partial unique index on order_rank is
  // checked per-row within the statement (not deferred), assigning a permuted rank
  // to a row whose OLD rank another row is about to take would transiently collide.
  // Nulling all ranks first, then upserting DISTINCT ranks, keeps every mid-statement
  // non-null rank unique. No-op on an empty set.
  async bulkUpsert(
    rows: Array<{
      collectionId: string;
      curatorId: string;
      itemId: string;
      score: number;
      confidence: number;
      rankBucket: "top" | "high" | "medium" | "low";
      comparisonCount: number;
      orderRank: number | null;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await this.db
      .insert(preferencesTable)
      .values(
        rows.map((r) => ({
          id: generateId("pref"),
          collectionId: r.collectionId,
          curatorId: r.curatorId,
          itemId: r.itemId,
          score: r.score.toString(),
          confidence: r.confidence.toString(),
          rankBucket: r.rankBucket,
          comparisonCount: r.comparisonCount,
          orderRank: r.orderRank,
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [preferencesTable.itemId, preferencesTable.curatorId],
        set: {
          score: sql`excluded.score`,
          confidence: sql`excluded.confidence`,
          rankBucket: sql`excluded.rank_bucket`,
          comparisonCount: sql`excluded.comparison_count`,
          orderRank: sql`excluded.order_rank`,
          lastSeen: now,
          updatedAt: now,
        },
      });
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

  async clearOrderRanks(collectionId: string, curatorId: string): Promise<void> {
    await this.db
      .update(preferencesTable)
      .set({ orderRank: null, updatedAt: new Date() })
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

  // Permanently DELETE every preference row of the collection, across ALL
  // curators (distinct from clear, which is collection+curator-scoped, and from
  // deleteByItem). Purge-only.
  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db.delete(preferencesTable).where(eq(preferencesTable.collectionId, collectionId));
  }

  // Permanently DELETE every preference row for the given curator across ALL
  // collections. Used during account deletion to remove the curator's borrowed-
  // collection slice. Account-deletion only.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db.delete(preferencesTable).where(eq(preferencesTable.curatorId, curatorId));
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
      orderRank: row.orderRank ?? null,
      lastSeen: row.lastSeen,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
