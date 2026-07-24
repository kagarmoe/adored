import { eq, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { preferencesTable } from "@/lib/db/schema";
import type { CollectionPreferenceItem, RankBucket } from "@/types";
import { generateId } from "@/lib/id";

export class CollectionPreferenceItemRepository {
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
    // score/confidence are `numeric` columns: drizzle reads AND writes them as
    // strings, while the domain type carries them as numbers. Destructure them out
    // so the rest of the patch can be spread under the real row type — a bare
    // `{...data}` is not assignable, which is exactly what the old `any` hid.
    const { score, confidence, ...rest } = data;
    const updateData: Partial<typeof preferencesTable.$inferInsert> = {
      ...rest,
      ...(score !== undefined && { score: score.toString() }),
      ...(confidence !== undefined && { confidence: confidence.toString() }),
      updatedAt: new Date(),
    };

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

  // Set the per-curator manual bin overlay (purses-xxo7) in ONE lock-free upsert.
  // Conflict target is the (item_id, curator_id) unique index. A NEW hand-only row
  // gets the tier-seed columns (rankBucket = manualBucket = bucket, score = seedScore,
  // confidence 0, comparisonCount 0, orderRank null); an EXISTING (possibly sorted)
  // row keeps every derived column and only manual_bucket changes. bulkUpsert's
  // conflict-SET omits manual_bucket and this SET touches only manual_bucket, so a
  // concurrent recompute and a bin write never clobber each other — no advisory lock.
  async setManualBucket(data: {
    collectionId: string;
    curatorId: string;
    itemId: string;
    bucket: "top" | "high" | "medium" | "low";
    seedScore: number;
  }): Promise<void> {
    const now = new Date();
    await this.db
      .insert(preferencesTable)
      .values({
        id: generateId("pref"),
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        itemId: data.itemId,
        score: data.seedScore.toString(),
        confidence: "0",
        rankBucket: data.bucket,
        manualBucket: data.bucket,
        comparisonCount: 0,
        orderRank: null,
        lastSeen: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [preferencesTable.itemId, preferencesTable.curatorId],
        set: { manualBucket: sql`excluded.manual_bucket`, updatedAt: now },
      });
  }

  // Clear the manual bin overlay in ONE statement (writable CTE). A HAND-ONLY row
  // (comparison_count = 0 — recompute never emits a count-0 row, so this is exactly
  // "no decision-event evidence for the item") is DELETED, so its placeholder
  // rankBucket can't resurface as the effective bucket; a SORTED row keeps its derived
  // rankBucket and only manual_bucket is nulled. Self-healing: a recompute landing
  // between read and write only moves a row hand-only → sorted, which the UPDATE arm
  // handles. No-op when no row matches (clear on an unbinned item). Scoped by
  // (item_id, curator_id) — never touches another curator's row.
  async clearManualBucket(itemId: string, curatorId: string): Promise<void> {
    await this.db.execute(sql`
      WITH deleted AS (
        DELETE FROM ${preferencesTable}
        WHERE ${preferencesTable.itemId} = ${itemId}
          AND ${preferencesTable.curatorId} = ${curatorId}
          AND ${preferencesTable.comparisonCount} = 0
        RETURNING ${preferencesTable.id}
      )
      UPDATE ${preferencesTable}
      SET ${sql.raw('manual_bucket')} = NULL, ${sql.raw('updated_at')} = now()
      WHERE ${preferencesTable.itemId} = ${itemId}
        AND ${preferencesTable.curatorId} = ${curatorId}
        AND NOT EXISTS (SELECT 1 FROM deleted)
    `);
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

  private mapToPreference(row: typeof preferencesTable.$inferSelect): CollectionPreferenceItem {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      itemId: row.itemId,
      score: parseFloat(row.score),
      confidence: parseFloat(row.confidence),
      rankBucket: row.rankBucket as RankBucket,
      manualBucket: row.manualBucket as RankBucket | null,
      comparisonCount: row.comparisonCount,
      orderRank: row.orderRank,
      lastSeen: row.lastSeen,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
