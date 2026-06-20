import { z } from "zod";
import type { Item } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";

const CreateItemSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateItemSchema = z.object({
  name: z.string().min(1).optional(),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;

export class ItemController {
  constructor(private itemRepo: IItemRepository) {}

  async listItems(collectionId: string): Promise<Item[]> {
    return this.itemRepo.findByCollection(collectionId);
  }

  async createItem(collectionId: string, data: unknown): Promise<Item> {
    const parsed = CreateItemSchema.parse(data);
    return this.itemRepo.create({
      collectionId,
      name: parsed.name,
      brand: parsed.brand,
      style: parsed.style,
      color: parsed.color,
      material: parsed.material,
      category: parsed.category,
      status: parsed.status,
      notes: parsed.notes,
    });
  }

  async getItem(itemId: string): Promise<Item> {
    const item = await this.itemRepo.findById(itemId);
    if (!item) {
      throw new Error("Item not found");
    }
    return item;
  }

  async updateItem(itemId: string, data: unknown): Promise<Item> {
    const parsed = UpdateItemSchema.parse(data);
    return this.itemRepo.update(itemId, parsed);
  }

  async deleteItem(itemId: string): Promise<Item> {
    return this.itemRepo.softDelete(itemId);
  }

  async restoreItem(itemId: string): Promise<Item> {
    return this.itemRepo.update(itemId, {
      deletedAt: null,
      updatedAt: new Date(),
    });
  }
}
