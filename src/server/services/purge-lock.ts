import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db";

/**
 * Serialize a purge against EVERY in-flight recompute for the collection.
 *
 * recalculatePreferences is a check-then-act: it reads the collection's live
 * items, then bulk-upserts preference rows for them. A purge committing in
 * between deletes an item that upsert is about to reference — preferences
 * .item_id has no ON DELETE CASCADE — so the curator's decision dies on a 23503
 * (500 mid-decision). The writers already serialize on lockCollectionCurator
 * (pg_advisory_xact_lock(hashtext(collection), hashtext(curator))); this takes
 * the SAME lock, on the SAME key scheme, inside the purge transaction.
 *
 * Not lockCollectionCurator(tx, id, actorId): the lock key is per-curator but a
 * purge is collection-wide, and the actor is the OWNER — an actor-keyed lock
 * would not block a COLLABORATOR's recompute at all. So take it for every
 * principal authz lets recompute this collection (owner + members). Ordered by
 * the lock key so two concurrent purges of one collection cannot cycle.
 * Advisory xact locks release at commit/rollback — nothing to unlock.
 */
export async function lockCollectionCurators(
  tx: Database,
  collectionId: string,
): Promise<void> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtext(${collectionId}), hashtext(curator_id))
    from (
      select owner_id as curator_id from collections where id = ${collectionId}
      union
      select user_id from memberships where collection_id = ${collectionId}
    ) c
    order by hashtext(curator_id)
  `);
}
