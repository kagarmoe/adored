import type { Collection } from "@/types";

export interface ICollectionRepository {
  create(data: {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
  }): Promise<Collection>;
  findById(id: string): Promise<Collection | null>;
  findBySlug(slug: string): Promise<Collection | null>;
  findByOwner(ownerId: string): Promise<Collection[]>;
  update(id: string, data: Partial<Omit<Collection, "id" | "createdAt" | "slug">>): Promise<Collection>;
  softDelete(id: string): Promise<Collection>;
  // Resolve a collection WITHOUT the deletedAt filter — purge must find a
  // soft-deleted collection too.
  findByIdIncludingDeleted(id: string): Promise<Collection | null>;
  // Permanent DELETE (purge). Caller has already removed FK-referencing children.
  hardDelete(id: string): Promise<void>;
}
