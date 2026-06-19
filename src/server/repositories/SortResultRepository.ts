import type { SortResult, SortResultItem } from "@/types";

export interface ISortResultRepository {
  create(data: {
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
  }): Promise<SortResult>;
  findById(id: string): Promise<SortResult | null>;
  findByCollection(collectionId: string): Promise<SortResult[]>;
  findByCollectionAndNumber(collectionId: string, number: number): Promise<SortResult | null>;
  findDraft(collectionId: string, curatorId: string): Promise<SortResult | null>;
  update(id: string, data: Partial<SortResult>): Promise<SortResult>;
  delete(id: string): Promise<void>;
}

export interface ISortResultItemRepository {
  create(data: {
    sortResultId: string;
    itemId: string;
    computedRank: number;
    computedBucket: "top" | "high" | "medium" | "low";
  }): Promise<SortResultItem>;
  findById(id: string): Promise<SortResultItem | null>;
  findByResult(sortResultId: string): Promise<SortResultItem[]>;
  update(id: string, data: Partial<SortResultItem>): Promise<SortResultItem>;
  delete(id: string): Promise<void>;
  deleteByResult(sortResultId: string): Promise<void>;
}
