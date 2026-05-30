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
}
