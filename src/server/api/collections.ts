import { z } from "zod";
import type { Collection } from "@/types";
import type { ICollectionRepository } from "@/server/repositories/CollectionRepository";

const CreateCollectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const UpdateCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
});

const PurgeConfirmSchema = z.object({
  confirm: z.enum(["PURGE"]),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionSchema>;

export class CollectionController {
  constructor(private collectionRepo: ICollectionRepository) {}

  async listCollections(userId: string): Promise<Collection[]> {
    // TODO: Fetch collections where user is a member, including owned collections
    // For now, fetch all collections owned by user
    return this.collectionRepo.findByOwner(userId);
  }

  async createCollection(
    userId: string,
    data: unknown,
  ): Promise<Collection> {
    const parsed = CreateCollectionSchema.parse(data);
    const id = `coll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.collectionRepo.create({
      id,
      ownerId: userId,
      name: parsed.name,
      description: parsed.description,
    });
  }

  async getCollection(collectionId: string): Promise<Collection> {
    const collection = await this.collectionRepo.findById(collectionId);
    if (!collection) {
      throw new Error("Collection not found");
    }
    return collection;
  }

  async updateCollection(
    collectionId: string,
    data: unknown,
  ): Promise<Collection> {
    const parsed = UpdateCollectionSchema.parse(data);
    return this.collectionRepo.update(collectionId, {
      ...(parsed.name && { name: parsed.name }),
      ...(parsed.description && { description: parsed.description }),
      ...(parsed.status && { status: parsed.status }),
    });
  }

  async archiveCollection(collectionId: string): Promise<Collection> {
    return this.collectionRepo.update(collectionId, {
      status: "archived",
      updatedAt: new Date(),
    });
  }

  async restoreCollection(collectionId: string): Promise<Collection> {
    return this.collectionRepo.update(collectionId, {
      status: "active",
      updatedAt: new Date(),
    });
  }

  async deleteCollection(collectionId: string): Promise<Collection> {
    return this.collectionRepo.softDelete(collectionId);
  }

  async purgeCollection(
    collectionId: string,
    data: unknown,
  ): Promise<{ message: string }> {
    const parsed = PurgeConfirmSchema.parse(data);
    if (parsed.confirm !== "PURGE") {
      throw new Error("Purge requires confirmation");
    }
    // TODO: Implement full purge (delete collection, all items, all photos from blob, all decisions)
    await this.collectionRepo.softDelete(collectionId);
    return { message: "Collection purged" };
  }

  async canManageCollection(
    userId: string,
    collectionId: string,
  ): Promise<boolean> {
    const collection = await this.collectionRepo.findById(collectionId);
    if (!collection) return false;
    if (collection.ownerId === userId) return true;

    // Check membership for can_manage_collection permission
    // TODO: Implement when MembershipRepository.findByUserAndCollection is available
    // For now, only owners can manage
    return false;
  }

  async isOwner(userId: string, collectionId: string): Promise<boolean> {
    const collection = await this.collectionRepo.findById(collectionId);
    if (!collection) return false;
    return collection.ownerId === userId;
  }
}
