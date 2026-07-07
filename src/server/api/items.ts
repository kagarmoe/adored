import { z } from "zod";
import type { Item } from "@/types";
import type { Database } from "@/lib/db";
import {
  ItemRepository,
  type FindByCollectionOptions,
} from "@/server/repositories/implementations/ItemRepository";

// Dimensions arrive as text (form inputs are strings) and land in Postgres
// `numeric` (Drizzle takes/returns strings). Postgres numeric accepts 'NaN', so
// finiteness is validated HERE, explicitly, not trusted to the column. An empty
// string means "not provided" → coerced to undefined so the column stays null
// and, for unit, so the DB default applies.
const DimensionSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .refine((s) => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 && n <= 10000;
    }, "Enter a measurement between 0 and 10000")
    .optional(),
);

const UnitSchema = z.enum(["imperial", "metric"]).optional();

const DimensionFields = {
  height: DimensionSchema,
  width: DimensionSchema,
  depth: DimensionSchema,
  weight: DimensionSchema,
  unit: UnitSchema,
};

const CreateItemSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  story: z.string().max(2000, "Story is too long").optional(),
  ...DimensionFields,
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
  story: z.string().max(2000, "Story is too long").optional(),
  ...DimensionFields,
});


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
      height: parsed.height,
      width: parsed.width,
      depth: parsed.depth,
      weight: parsed.weight,
      unit: parsed.unit,
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
