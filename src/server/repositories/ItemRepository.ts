import type { Item } from "@/types";

// Optional bounds for the workspace item preview. Omit both and findByCollection
// keeps today's behavior (full, unordered collection read for the /items grid).
// `orderBy: "number"` is index-backed (items_collection_number_unique) and unique,
// so it needs no tiebreaker; `number` is the only supported order key for now.
export interface FindByCollectionOptions {
  limit?: number;
  orderBy?: "number";
}

export interface IItemRepository {
  create(data: {
    collectionId: string;
    name?: string | null;
    number?: number;
    brand?: string;
    style?: string;
    color?: string;
    material?: string;
    category?: string;
    status?: string;
    notes?: string;
  }): Promise<Item>;
  findById(id: string): Promise<Item | null>;
  // Resolve an item WITHOUT the deletedAt filter — purge must find soft-deleted
  // items too (findById can't, so it can't be reused on the purge path).
  findByIdIncludingDeleted(id: string): Promise<Item | null>;
  findByCollection(
    collectionId: string,
    options?: FindByCollectionOptions,
  ): Promise<Item[]>;
  findByCollectionAndNumber(collectionId: string, number: number): Promise<Item | null>;
  getNextCatalogNumber(collectionId: string): Promise<number>;
  update(id: string, data: Partial<Omit<Item, "id" | "createdAt">>): Promise<Item>;
  softDelete(id: string): Promise<Item>;
  // Permanent DELETE (purge). Caller has already removed FK-referencing children.
  hardDelete(id: string): Promise<void>;
  // Permanently DELETE every item of the collection (active AND soft-deleted),
  // returning the affected count. Caller has already removed FK-referencing
  // children. Purge-only.
  hardDeleteByCollection(collectionId: string): Promise<number>;
}
