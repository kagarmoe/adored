import { eq, isNull, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { collectionsTable } from "@/lib/db/schema";
import type { ICollectionRepository } from "../CollectionRepository";
import type { Collection } from "@/types";

export class CollectionRepository implements ICollectionRepository {
  constructor(private db: Database) {}

  async create(data: {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
  }): Promise<Collection> {
    const [collection] = await this.db
      .insert(collectionsTable)
      .values({
        id: data.id,
        ownerId: data.ownerId,
        name: data.name,
        description: data.description || null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })
      .returning();
    return this.mapToCollection(collection);
  }

  async findById(id: string): Promise<Collection | null> {
    const [collection] = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.id, id), isNull(collectionsTable.deletedAt)));
    return collection ? this.mapToCollection(collection) : null;
  }

  async findByOwner(ownerId: string): Promise<Collection[]> {
    const collections = await this.db
      .select()
      .from(collectionsTable)
      .where(and(eq(collectionsTable.ownerId, ownerId), isNull(collectionsTable.deletedAt)));
    return collections.map((c) => this.mapToCollection(c));
  }

  async update(id: string, data: Partial<Collection>): Promise<Collection> {
    const [collection] = await this.db
      .update(collectionsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(collectionsTable.id, id))
      .returning();
    return this.mapToCollection(collection);
  }

  async softDelete(id: string): Promise<Collection> {
    const [collection] = await this.db
      .update(collectionsTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(collectionsTable.id, id))
      .returning();
    return this.mapToCollection(collection);
  }

  private mapToCollection(row: any): Collection {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
