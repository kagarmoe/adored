import type { CollectionPreferenceItem } from "@/types";

export interface ICollectionPreferenceItemRepository {
  create(data: {
    collectionId: string;
    curatorId: string;
    itemId: string;
    score: number;
    confidence: number;
    rankBucket: "top" | "high" | "medium" | "low";
    comparisonCount: number;
    orderRank?: number | null;
  }): Promise<CollectionPreferenceItem>;
  findById(id: string): Promise<CollectionPreferenceItem | null>;
  findByItem(itemId: string, curatorId: string): Promise<CollectionPreferenceItem | null>;
  findByCollection(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]>;
  update(
    id: string,
    data: Partial<CollectionPreferenceItem>,
  ): Promise<CollectionPreferenceItem>;
  // Persist a whole recomputed preference set in ONE upsert statement, keyed on the
  // (item_id, curator_id) unique index. Callers MUST clearOrderRanks first so no two
  // rows share a non-null order_rank mid-statement (the partial unique index checks
  // per-row, not deferred) — see PreferenceStateService.recalculatePreferences.
  bulkUpsert(
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
  ): Promise<void>;
  clear(collectionId: string, curatorId: string): Promise<void>;
  // Set order_rank = NULL for every preference of the curator in this collection,
  // in one statement. Used to reset the binary-insertion ordering before a re-rank.
  clearOrderRanks(collectionId: string, curatorId: string): Promise<void>;
  // Permanently DELETE every preference row for an item, across ALL curators.
  // Distinct from clear (which is collection+curator-scoped) — purge removes the
  // item's derived preference state for everyone. Returns the affected count
  // (for the purge audit metadata). Purge-only.
  deleteByItem(itemId: string): Promise<number>;
  // Delete every preference of the collection across ALL curators (distinct from
  // clear, which is collection+curator-scoped). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
