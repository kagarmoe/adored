import { z } from "zod";
import type { Item } from "@/types";
import type { Database } from "@/lib/db";
import {
  ItemRepository,
  type FindByCollectionOptions,
} from "@/server/repositories/implementations/ItemRepository";

// Same length caps as UpdateItemSchema, so create can't store what an edit would refuse.
const CreateItemSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  style: z.string().max(200).optional(),
  color: z.string().max(200).optional(),
  material: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  status: z.string().optional(),
  notes: z.string().max(5000).optional(),
  story: z.string().max(2000, "Story is too long").optional(),
});

// Strict: an unknown key is a 400, never a silent 200 (spec §3). Text clears persist as
// null; a blank string is a clear. Measures are numbers on the wire, numeric strings in
// the DB (drizzle `numeric`). zod 4's z.number() already rejects NaN/Infinity.
const clearableText = (max: number) =>
  z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();
const measure = z.number().nonnegative().max(100_000).nullable().optional();
const UpdateItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  brand: clearableText(200),
  style: clearableText(200),
  color: clearableText(200),
  material: clearableText(200),
  category: clearableText(200),
  status: z.string().optional(),
  notes: clearableText(5000),
  story: clearableText(2000),
  height: measure,
  width: measure,
  depth: measure,
  weight: measure,
  unit: z.enum(["imperial", "metric"]).optional(),
});
const toNumeric = (n: number | null | undefined) =>
  n === undefined ? undefined : n === null ? null : String(n);

export class ItemController {
  constructor(private itemRepo: ItemRepository) {}

  static fromDb(db: Database): ItemController {
    return new ItemController(new ItemRepository(db));
  }

  // `options` opts into the bounded workspace preview ({ limit: 12, orderBy:
  // "number" }); omit it for the full /items grid read.
  async listItems(
    collectionId: string,
    options?: FindByCollectionOptions,
  ): Promise<Item[]> {
    return this.itemRepo.findByCollection(collectionId, options);
  }

  async listArchived(collectionId: string): Promise<Item[]> {
    return this.itemRepo.findArchivedByCollection(collectionId);
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
      story: parsed.story,
    });
  }

  async getItem(itemId: string): Promise<Item | null> {
    // Returns null for an absent/soft-deleted item so the route maps it to 404
    // (a thrown "not found" was previously caught as a generic 500).
    return this.itemRepo.findById(itemId);
  }

  async getByCollectionAndNumber(collectionId: string, number: number): Promise<Item | null> {
    return this.itemRepo.findByCollectionAndNumber(collectionId, number);
  }

  async updateItem(itemId: string, data: unknown): Promise<Item> {
    const { height, width, depth, weight, ...rest } = UpdateItemSchema.parse(data);
    return this.itemRepo.update(itemId, {
      ...rest,
      height: toNumeric(height),
      width: toNumeric(width),
      depth: toNumeric(depth),
      weight: toNumeric(weight),
    });
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
