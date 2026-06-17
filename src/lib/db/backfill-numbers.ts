import { sql, isNull, eq, asc } from "drizzle-orm";
import { sessionsTable, sortResultsTable } from "@/lib/db/schema";

type NumberedTable = typeof sessionsTable | typeof sortResultsTable;

/**
 * Assign per-collection sequential numbers to every row whose `number` is NULL,
 * oldest (createdAt) first, continuing after the collection's current MAX.
 * Idempotent: rows that already have a number are untouched.
 */
export async function backfillTable(db: any, table: NumberedTable): Promise<number> {
  const rows = await db
    .select({ id: table.id, collectionId: table.collectionId })
    .from(table)
    // No deletedAt filter: a soft-deleted session still owns its slot in the
    // (collection_id, number) unique index; numbering it (like getNextSessionNumber's
    // MAX-over-all-rows) prevents future number reuse/collision. asc(id) breaks
    // same-millisecond createdAt ties for deterministic numbering.
    .where(isNull(table.number))
    .orderBy(asc(table.createdAt), asc(table.id));

  const byCollection = new Map<string, string[]>();
  for (const r of rows) {
    const list = byCollection.get(r.collectionId) ?? [];
    list.push(r.id);
    byCollection.set(r.collectionId, list);
  }

  let updated = 0;
  for (const [collectionId, ids] of byCollection) {
    const [{ max }] = await db
      .select({ max: sql<number | null>`max(${table.number})` })
      .from(table)
      .where(eq(table.collectionId, collectionId));
    let next = (max ?? 0) + 1;
    for (const id of ids) {
      await db.update(table).set({ number: next }).where(eq(table.id, id));
      next++;
      updated++;
    }
  }
  return updated;
}

export async function backfillNumbers(db: any): Promise<void> {
  const sessions = await backfillTable(db, sessionsTable);
  const results = await backfillTable(db, sortResultsTable);
  console.log(`  sessions: ${sessions} rows; sort_results: ${results} rows`);
}
