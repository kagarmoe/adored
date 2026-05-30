import type { Item } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";

export class ItemService {
  constructor(private repo: IItemRepository) {}

  async createItem(
    collectionId: string,
    data: {
      name: string;
      brand?: string;
      style?: string;
      color?: string;
      material?: string;
      category?: string;
      status?: string;
      notes?: string;
    },
  ): Promise<Item> {
    return this.repo.create({ collectionId, ...data });
  }

  async getItem(itemId: string): Promise<Item | null> {
    return this.repo.findById(itemId);
  }

  async getCollectionItems(collectionId: string): Promise<Item[]> {
    return this.repo.findByCollection(collectionId);
  }

  async updateItem(itemId: string, data: Partial<Item>): Promise<Item> {
    return this.repo.update(itemId, {
      ...data,
      updatedAt: new Date(),
    });
  }

  async deleteItem(itemId: string): Promise<Item> {
    return this.repo.softDelete(itemId);
  }
}
