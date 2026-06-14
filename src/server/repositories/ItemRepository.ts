import type { Item } from "@/types";

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
  findByCollection(collectionId: string): Promise<Item[]>;
  findByCollectionAndNumber(collectionId: string, number: number): Promise<Item | null>;
  getNextCatalogNumber(collectionId: string): Promise<number>;
  update(id: string, data: Partial<Omit<Item, "id" | "createdAt">>): Promise<Item>;
  softDelete(id: string): Promise<Item>;
}
