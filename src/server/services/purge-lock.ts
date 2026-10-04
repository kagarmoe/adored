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

/**
 * Account deletion's borrowed pass (Phase 2) erases one curator's private rows in every collection
 * they are a member of. Take that curator's writer lock in each, so a pin, save, share or decision
 * for the same (collection, curator) either commits before the deletes or waits for them — never
 * lands between a child delete and the sort_results delete (no cascade → 23503).
 *
 * Memberships only: owned collections were already purged (under lockCollectionCurators), and a
 * collection the user no longer belongs to has no writer that passes authz. Ordered by the lock
 * key; a writer holds one curator lock (plus lockSaveKey, a disjoint keyspace taken last) and a
 * purge locks one collection, so no cycle. Released at commit/rollback.
 */
export async function lockCuratorMemberships(
  tx: Database,
  curatorId: string,
): Promise<void> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtext(collection_id), hashtext(${curatorId}))
    from memberships
    where user_id = ${curatorId}
    order by hashtext(collection_id)
  `);
}
