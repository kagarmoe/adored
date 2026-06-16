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
}
