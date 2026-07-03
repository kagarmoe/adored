import { z } from "zod";
import type { Collection } from "@/types";
import { generateId } from "@/lib/id";
import type { Database } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

const CreateCollectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const UpdateCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
});


export class CollectionController {
  constructor(private collectionRepo: CollectionRepository) {}

  static fromDb(db: Database): CollectionController {
    return new CollectionController(new CollectionRepository(db));
  }

  async getIncludingDeleted(collectionId: string): Promise<Collection | null> {
    return this.collectionRepo.findByIdIncludingDeleted(collectionId);
  }

  async listCollections(userId: string): Promise<Collection[]> {
    // Owned ∪ collections where a membership row exists for the user (accepted
    // members — a row is created only on invitation-accept). Pending invitations
    // are deliberately NOT read, so an unaccepted invite never surfaces a
    // collection the user hasn't joined (IDOR-by-list).
    return this.collectionRepo.findByOwnerOrMember(userId);
  }

  async createCollection(
    userId: string,
    data: unknown,
  ): Promise<Collection> {
    const parsed = CreateCollectionSchema.parse(data);
    const id = generateId("coll");
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
}
