import type { ItemDisposition, Disposition } from "@/types";

export interface IItemDispositionRepository {
  upsert(data: {
    collectionId: string;
    curatorId: string;
    itemId: string;
    disposition: Disposition;
  }): Promise<ItemDisposition>;
  findByCollectionAndCurator(
    collectionId: string,
    curatorId: string,
  ): Promise<ItemDisposition[]>;
  findByItem(itemId: string, curatorId: string): Promise<ItemDisposition | null>;
  // Remove this curator's disposition for the item. Returns rows removed
  // (idempotent — 0 when absent).
  delete(itemId: string, curatorId: string): Promise<number>;
  // Purge-only: remove every curator's disposition for the item. Returns the
  // affected count (for purge audit metadata).
  deleteByItem(itemId: string): Promise<number>;
  // Purge-only: remove every disposition row of the collection.
  deleteByCollection(collectionId: string): Promise<void>;
}
