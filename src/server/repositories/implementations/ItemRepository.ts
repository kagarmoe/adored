import { eq, isNull, isNotNull, and, sql, asc, desc } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { itemsTable } from "@/lib/db/schema";
import type { Item } from "@/types";
import { generateId } from "@/lib/id";
import { allocateWithRetry } from "../allocateWithRetry";
import { isUniqueViolation } from "../pg-conflict";

// Optional bounds for the workspace item preview. Omit both and findByCollection
// keeps today's behavior (full, unordered collection read for the /items grid).
// `orderBy: "number"` sorts number ASC with an id ASC tiebreaker (number is
// nullable, so determinism can't rest on it alone); `number` is the only
// supported order key for now.
export interface FindByCollectionOptions {
  limit?: number;
  orderBy?: "number";
}

export class ItemRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    name?: string | null;
    number?: number;
    brand?: string;
    style?: string;
    color?: string;
    material?: string;
    category?: string;
    status?: string;
    notes?: string;
    story?: string | null;
  }): Promise<Item> {
    const id = data.id || generateId("item");
    const base = {
      id,
      collectionId: data.collectionId,
      name: data.name ?? null,
      brand: data.brand || null,
      style: data.style || null,
      color: data.color || null,
      material: data.material || null,
      category: data.category || null,
      status: data.status || null,
      notes: data.notes || null,
      story: data.story || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Explicit number: single insert, let any conflict surface.
    if (data.number != null) {
      const [item] = await this.db
        .insert(itemsTable)
        .values({ ...base, number: data.number })
        .returning();
      return this.mapToItem(item);
    }

    // Auto-allocate MAX+1, retry on the UNIQUE(collection_id, number) race
    // (a retry-able insert — simpler than locking the max; a transaction is available but unnecessary here).
    return allocateWithRetry(async () => {
      const number = await this.getNextCatalogNumber(data.collectionId);
      const [item] = await this.db
        .insert(itemsTable)
        .values({ ...base, number })
        .returning();
      return this.mapToItem(item);
    }, isCatalogNumberConflict);
  }

  async findById(id: string): Promise<Item | null> {
    const [item] = await this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.id, id), isNull(itemsTable.deletedAt)));
    return item ? this.mapToItem(item) : null;
  }

  async findByIdIncludingDeleted(id: string): Promise<Item | null> {
    const [item] = await this.db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, id));
    return item ? this.mapToItem(item) : null;
  }

  // Non-deleted items of a collection. With no options this is the full,
  // unordered read the /items grid already relies on (unchanged). The workspace
  // preview opts into a bounded slice: { limit: 12, orderBy: "number" }. number
  // is nullable in schema (determinism rests on the app invariant that create
  // always assigns one, not a DB constraint), so id ASC is the belt-and-suspenders
  // tiebreaker — matching the pool read — that keeps a LIMIT cut deterministic.
  async findByCollection(
    collectionId: string,
    options?: FindByCollectionOptions,
  ): Promise<Item[]> {
    const base = this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.collectionId, collectionId), isNull(itemsTable.deletedAt)));
    const ordered =
      options?.orderBy === "number"
        ? base.orderBy(asc(itemsTable.number), asc(itemsTable.id))
        : base;
    const items =
      options?.limit === undefined ? await ordered : await ordered.limit(options.limit);
    return items.map((i) => this.mapToItem(i));
  }

  // Soft-deleted ("archived") items of a collection, most recently archived first.
  async findArchivedByCollection(collectionId: string): Promise<Item[]> {
    const rows = await this.db
      .select()
      .from(itemsTable)
      .where(and(eq(itemsTable.collectionId, collectionId), isNotNull(itemsTable.deletedAt)))
      .orderBy(desc(itemsTable.deletedAt), asc(itemsTable.id));
    return rows.map((r) => this.mapToItem(r));
  }

  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<Item | null> {
    const [item] = await this.db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.collectionId, collectionId),
          eq(itemsTable.number, number),
          isNull(itemsTable.deletedAt),
        ),
      );
    return item ? this.mapToItem(item) : null;
  }

  async getNextCatalogNumber(collectionId: string): Promise<number> {
    // MAX over ALL rows (incl. soft-deleted) — a deleted item still holds its
    // number in the UNIQUE(collection_id, number) index, so reusing it would
    // collide. Resolution (findByCollectionAndNumber) excludes deleted rows.
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${itemsTable.number})` })
      .from(itemsTable)
      .where(eq(itemsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
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

  async hardDelete(id: string): Promise<void> {
    await this.db.delete(itemsTable).where(eq(itemsTable.id, id));
  }

  // Permanently DELETE every item of the collection (active AND soft-deleted),
  // returning the affected count. Caller has already removed FK-referencing
  // children (photos, result-items, preferences). Purge-only.
  async hardDeleteByCollection(collectionId: string): Promise<number> {
    const rows = await this.db
      .delete(itemsTable)
      .where(eq(itemsTable.collectionId, collectionId))
      .returning({ id: itemsTable.id });
    return rows.length;
  }

  private mapToItem(row: typeof itemsTable.$inferSelect): Item {
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
      story: row.story,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

function isCatalogNumberConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(collection_id, number) race — any other unique
  // violation is a real bug and must surface, not be masked by retries.
  // Constraint name matches the Drizzle-generated unique index; update if renamed.
  return isUniqueViolation(error, "items_collection_number_unique");
}
