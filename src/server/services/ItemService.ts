import type { Item } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

const MAX_GROUP_PHOTOS = 50;

export class PoolGroupError extends Error {
  constructor(
    public readonly code: "empty" | "too_many" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PoolGroupError";
  }
}

export class ItemService {
  constructor(
    private repo: IItemRepository,
    private photoRepo: IPhotoRepository,
  ) {}

  // Make one item from selected pooled photos: create the (nameless,
  // catalog-numbered) item, then assign the photos with the first as hero.
  // Order is create -> assign because neon-http is stateless; the worst partial
  // failure is a harmless empty item, and the repo's affected-count guard makes
  // assignment all-or-reject (see assignPooledPhotosToItem).
  async createItemFromPool(collectionId: string, photoIds: string[]): Promise<Item> {
    const ids = [...new Set(photoIds)];
    if (ids.length === 0) {
      throw new PoolGroupError("empty", "Choose at least one photo to make an item.");
    }
    if (ids.length > MAX_GROUP_PHOTOS) {
      throw new PoolGroupError("too_many", `You can group up to ${MAX_GROUP_PHOTOS} photos at once.`);
    }
    const item = await this.repo.create({ collectionId });
    const assigned = await this.photoRepo.assignPooledPhotosToItem(
      collectionId,
      ids,
      item.id,
      ids[0],
    );
    if (assigned !== ids.length) {
      throw new PoolGroupError(
        "conflict",
        "Some of those photos aren't available to group anymore — try again.",
      );
    }
    return item;
  }

  async createItem(
    collectionId: string,
    data: {
      name?: string | null;
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

  async restoreItem(itemId: string): Promise<Item> {
    return this.repo.update(itemId, {
      deletedAt: null,
      updatedAt: new Date(),
    });
  }
}
