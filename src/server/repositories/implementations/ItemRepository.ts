import { eq, isNull, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { itemsTable } from "@/lib/db/schema";
import type { IItemRepository } from "../ItemRepository";
import type { Item } from "@/types";
import { generateId } from "@/lib/id";

export class ItemRepository implements IItemRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    name: string;
    brand?: string;
    style?: string;
    color?: string;
    material?: string;
    category?: string;
    status?: string;
    notes?: string;
  }): Promise<Item> {
    const id = data.id || generateId("item");
    const [item] = await this.db
      .insert(itemsTable)
      .values({
        id,
        collectionId: data.collectionId,
        name: data.name,
        brand: data.brand || null,
        style: data.style || null,
        color: data.color || null,
        material: data.material || null,
        category: data.category || null,
        status: data.status || null,
        notes: data.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })
      .returning();
    return this.mapToItem(item);
  }

  async findById(id: string): Promise<Item | null> {
    const [item] = await this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.id, id), isNull(itemsTable.deletedAt)));
    return item ? this.mapToItem(item) : null;
  }

  async findByCollection(collectionId: string): Promise<Item[]> {
    const items = await this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.collectionId, collectionId), isNull(itemsTable.deletedAt)));
    return items.map((i) => this.mapToItem(i));
  }

  async update(id: string, data: Partial<Item>): Promise<Item> {
    const [item] = await this.db
      .update(itemsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(itemsTable.id, id))
      .returning();
    return this.mapToItem(item);
  }

  async softDelete(id: string): Promise<Item> {
    const [item] = await this.db
      .update(itemsTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(itemsTable.id, id))
      .returning();
    return this.mapToItem(item);
  }

  private mapToItem(row: any): Item {
    return {
      id: row.id,
      collectionId: row.collectionId,
      name: row.name,
      brand: row.brand,
      style: row.style,
      color: row.color,
      material: row.material,
      category: row.category,
      number: row.number,
      height: row.height,
      width: row.width,
      depth: row.depth,
      weight: row.weight,
      unit: row.unit,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
