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
  clear(collectionId: string, curatorId: string): Promise<void>;
  // Permanently DELETE every preference row for an item, across ALL curators.
  // Distinct from clear (which is collection+curator-scoped) — purge removes the
  // item's derived preference state for everyone. Returns the affected count
  // (for the purge audit metadata). Purge-only.
  deleteByItem(itemId: string): Promise<number>;
  // Delete every preference of the collection across ALL curators (distinct from
  // clear, which is collection+curator-scoped). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
