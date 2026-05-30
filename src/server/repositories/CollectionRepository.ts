import type { Collection } from "@/types";

export interface ICollectionRepository {
  create(data: {
    ownerId: string;
    name: string;
    description?: string;
  }): Promise<Collection>;
  findById(id: string): Promise<Collection | null>;
  findByOwner(ownerId: string): Promise<Collection[]>;
  update(id: string, data: Partial<Omit<Collection, "id" | "createdAt">>): Promise<Collection>;
  softDelete(id: string): Promise<Collection>;
}
