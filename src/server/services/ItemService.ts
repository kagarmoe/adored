import type { Item } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export const MAX_GROUP_PHOTOS = 50;

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

  // Make one item from selected pooled photos: pre-validate availability, then
  // create the (nameless, catalog-numbered) item and assign the photos with the
  // first as hero. neon-http is stateless (no transaction), so we pre-check
  // availability before any write — a conflict must leave the pool untouched —
  // and keep the assign guard as a race backstop that compensates the item.
  async createItemFromPool(collectionId: string, photoIds: string[]): Promise<Item> {
    const ids = [...new Set(photoIds)];
    if (ids.length === 0) {
      throw new PoolGroupError("empty", "Choose at least one photo to make an item.");
    }
    if (ids.length > MAX_GROUP_PHOTOS) {
      throw new PoolGroupError("too_many", `You can group up to ${MAX_GROUP_PHOTOS} photos at once.`);
    }

    // Pre-validate availability BEFORE creating or assigning anything, so a
    // conflict leaves the pool untouched — no orphan item, no half-assigned
    // photos. neon-http has no transaction; this check plus the assign guard
    // below keep conflicts clean.
    const available = await this.photoRepo.countAvailablePooled(collectionId, ids);
    if (available !== ids.length) {
      throw new PoolGroupError(
        "conflict",
        "Some of those photos aren't available to group anymore — try again.",
      );
    }

    const item = await this.repo.create({ collectionId });
    const assigned = await this.photoRepo.assignPooledPhotosToItem(
      collectionId,
      ids,
      item.id,
      ids[0],
    );
    if (assigned !== ids.length) {
      // Lost a race between the check and the assign (rare). Return any photos
      // that did get assigned to the pool, then remove the empty item — a
      // conflict leaves neither an orphan item nor an orphaned photo.
      await this.photoRepo.unassignAllFromItem(item.id);
      await this.repo.softDelete(item.id);
      throw new PoolGroupError(
        "conflict",
        "Some of those photos aren't available to group anymore — try again.",
      );
    }
    return item;
  }

  // Make one item PER photo: a bulk fast-path where N selected photos become N
  // items, each with its single photo as hero. Mirrors createItemFromPool's
  // validation and pre-check discipline — a conflict touches nothing — but loops
  // create+assign per photo. All-or-nothing: if any photo loses a race, every
  // item made this call is rolled back so success always means all were made.
  async createItemsFromPoolEach(collectionId: string, photoIds: string[]): Promise<Item[]> {
    const ids = [...new Set(photoIds)];
    if (ids.length === 0) {
      throw new PoolGroupError("empty", "Choose at least one photo to make items.");
    }
    if (ids.length > MAX_GROUP_PHOTOS) {
      throw new PoolGroupError("too_many", `You can make up to ${MAX_GROUP_PHOTOS} items at once.`);
    }

    // Pre-validate availability up front so a conflict touches nothing.
    const available = await this.photoRepo.countAvailablePooled(collectionId, ids);
    if (available !== ids.length) {
      throw new PoolGroupError(
        "conflict",
        "Some of those photos aren't available to group anymore — try again.",
      );
    }

    const created: Item[] = [];
    for (const id of ids) {
      const item = await this.repo.create({ collectionId });
      const assigned = await this.photoRepo.assignPooledPhotosToItem(collectionId, [id], item.id, id);
      if (assigned !== 1) {
        // Lost a race for this photo — roll back everything made this call so the
        // action is all-or-nothing (no orphan items, no photos vanishing from the
        // pool view, consistent with the combine path).
        await this.photoRepo.unassignAllFromItem(item.id);
        await this.repo.softDelete(item.id);
        for (const made of created) {
          await this.photoRepo.unassignAllFromItem(made.id);
          await this.repo.softDelete(made.id);
        }
        throw new PoolGroupError(
          "conflict",
          "Some of those photos aren't available to group anymore — try again.",
        );
      }
      created.push(item);
    }
    return created;
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
