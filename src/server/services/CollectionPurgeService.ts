import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { withTransaction } from "@/lib/transactions";
import { del } from "@vercel/blob";
import { deleteVariants, variantPrefix } from "@/lib/photo-variants";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

/**
 * Permanent owner-decided erasure of a WHOLE collection. The route has resolved
 * the collection (incl. soft-deleted) and gated the caller as its owner; this
 * service does the destructive work. Total-erase: every curator's sessions,
 * preferences, and sort results (draft + finalized) go.
 *
 * Children-first hard delete in ONE transaction (no FK has ON DELETE CASCADE),
 * then a collection.purge audit row in the SAME tx (a committed purge always
 * carries its actor record). Blobs are del'd best-effort AFTER commit.
 *
 * Invariant: inside the transaction, EVERY write goes through a tx-bound repo
 * (`new XRepository(tx)`), never an injected/`this.db` repo — a non-tx write
 * would not roll back with the transaction.
 */
export class CollectionPurgeService {
  constructor(private db: Database) {}

  async purge(collection: Collection, actorId: string): Promise<void> {
    const blobKeys = await withTransaction(this.db, async (tx) => {
      await new SortResultShareRepository(tx).deleteByCollection(collection.id);
      await new SortResultItemRepository(tx).deleteByCollection(collection.id);
      await new SortResultRepository(tx).deleteByCollection(collection.id);
      await new DecisionEventRepository(tx).deleteByCollection(collection.id);
      await new SessionRepository(tx).deleteByCollection(collection.id);
      await new CollectionPreferenceItemRepository(tx).deleteByCollection(collection.id);
      // No ON DELETE CASCADE on the item_dispositions FK — clear it before the
      // items hard-delete or that delete throws a 23503.
      await new ItemDispositionRepository(tx).deleteByCollection(collection.id);
      const keys = await new PhotoRepository(tx).hardDeleteByCollection(collection.id);
      const itemsDeleted = await new ItemRepository(tx).hardDeleteByCollection(collection.id);
      await new InvitationRepository(tx).deleteByCollection(collection.id);
      await new MembershipRepository(tx).deleteByCollection(collection.id);
      await new CollectionRepository(tx).hardDelete(collection.id);
      await new AuditLogRepository(tx).record({
        actorId,
        action: "collection.purge",
        targetType: "collection",
        targetId: collection.id,
        collectionId: collection.id,
        metadata: { photosDeleted: keys.length, itemsDeleted },
      });
      return keys;
    });

    // Best-effort, post-commit. Only http(s) keys are real blob URLs; a del
    // rejection is logged, not fatal — the DB purge already committed.
    const results = await Promise.allSettled(
      blobKeys.filter((k) => k.startsWith("http")).map((k) => del(k)),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("CollectionPurgeService: blob del failed (orphaned, sweepable)", r.reason);
      }
    }

    // Best-effort: sweep every persisted resized variant for the collection.
    await deleteVariants(variantPrefix(collection.id));
  }
}
