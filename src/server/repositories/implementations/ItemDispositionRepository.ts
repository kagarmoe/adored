import { eq, and } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { itemDispositionsTable } from "@/lib/db/schema";
import type { IItemDispositionRepository } from "../ItemDispositionRepository";
import type { ItemDisposition, Disposition } from "@/types";
import { generateId } from "@/lib/id";

export class ItemDispositionRepository implements IItemDispositionRepository {
  constructor(private db: Database) {}

  async upsert(data: {
    collectionId: string;
    curatorId: string;
    itemId: string;
    disposition: Disposition;
  }): Promise<ItemDisposition> {
    const [row] = await this.db
      .insert(itemDispositionsTable)
      .values({
        id: generateId("disp"),
        collectionId: data.collectionId,
        curatorId: data.curatorId,
        itemId: data.itemId,
        disposition: data.disposition,
      })
      .onConflictDoUpdate({
        target: [itemDispositionsTable.itemId, itemDispositionsTable.curatorId],
        set: { disposition: data.disposition, updatedAt: new Date() },
      })
      .returning();
    return this.map(row);
  }

  async findByCollectionAndCurator(
    collectionId: string,
    curatorId: string,
  ): Promise<ItemDisposition[]> {
    const rows = await this.db
      .select()
      .from(itemDispositionsTable)
      .where(
        and(
          eq(itemDispositionsTable.collectionId, collectionId),
          eq(itemDispositionsTable.curatorId, curatorId),
        ),
      );
    return rows.map((r) => this.map(r));
  }

  async findByItem(itemId: string, curatorId: string): Promise<ItemDisposition | null> {
    const [row] = await this.db
      .select()
      .from(itemDispositionsTable)
      .where(
        and(
          eq(itemDispositionsTable.itemId, itemId),
          eq(itemDispositionsTable.curatorId, curatorId),
        ),
      );
    return row ? this.map(row) : null;
  }

  async delete(itemId: string, curatorId: string): Promise<number> {
    const deleted = await this.db
      .delete(itemDispositionsTable)
      .where(
        and(
          eq(itemDispositionsTable.itemId, itemId),
          eq(itemDispositionsTable.curatorId, curatorId),
        ),
      )
      .returning({ id: itemDispositionsTable.id });
    return deleted.length;
  }

  async deleteByItem(itemId: string): Promise<number> {
    const deleted = await this.db
      .delete(itemDispositionsTable)
      .where(eq(itemDispositionsTable.itemId, itemId))
      .returning({ id: itemDispositionsTable.id });
    return deleted.length;
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    await this.db
      .delete(itemDispositionsTable)
      .where(eq(itemDispositionsTable.collectionId, collectionId));
  }

  // Purge-only (account deletion): remove every disposition for the given
  // curator across ALL collections. Not in the interface — used by
  // AccountDeletionService to clear the curator's borrowed-collection slice.
  async deleteByCurator(curatorId: string): Promise<void> {
    await this.db
      .delete(itemDispositionsTable)
      .where(eq(itemDispositionsTable.curatorId, curatorId));
  }

  private map(row: typeof itemDispositionsTable.$inferSelect): ItemDisposition {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      itemId: row.itemId,
      disposition: row.disposition as Disposition,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
