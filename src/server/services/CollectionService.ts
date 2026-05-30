import type { Collection } from "@/types";
import type { ICollectionRepository } from "@/server/repositories/CollectionRepository";

export class CollectionService {
  constructor(private repo: ICollectionRepository) {}

  async createCollection(data: {
    name: string;
    description?: string;
    ownerId: string;
  }): Promise<Collection> {
    const id = `coll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.repo.create({ ...data, id });
  }

  async getCollection(collectionId: string): Promise<Collection | null> {
    return this.repo.findById(collectionId);
  }

  async getCollectionsByOwner(ownerId: string): Promise<Collection[]> {
    return this.repo.findByOwner(ownerId);
  }

  async updateCollection(
    collectionId: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    return this.repo.update(collectionId, {
      ...data,
      updatedAt: new Date(),
    });
  }

  async archiveCollection(collectionId: string): Promise<Collection> {
    return this.repo.update(collectionId, {
      status: "archived",
      updatedAt: new Date(),
    });
  }

  async restoreCollection(collectionId: string): Promise<Collection> {
    return this.repo.update(collectionId, {
      status: "active",
      updatedAt: new Date(),
    });
  }

  async deleteCollection(collectionId: string): Promise<Collection> {
    return this.repo.softDelete(collectionId);
  }
}
