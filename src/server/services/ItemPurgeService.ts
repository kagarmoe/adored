import type { Database } from "@/lib/db";
import { withTransaction } from "@/lib/transactions";
import { del } from "@vercel/blob";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

/**
 * Thrown when purge targets an item that is referenced by any sort_result_item
 * (draft or finalized). The route maps it to 409 — the owner must first detach
 * the item from its draft results (POST /api/items/[id]/remove-from-sorts);
 * finalized results are immutable, so a finalized membership is a hard block.
 */
export class ItemInResultError extends Error {
  constructor() {
    super(
      "Item is part of a sort result — remove it from sorts first " +
        "(POST /api/items/[id]/remove-from-sorts), or it is in a finalized " +
        "result and cannot be purged",
    );
    this.name = "ItemInResultError";
  }
}

/**
 * Permanent owner-decided removal of an item. The route has already resolved the
 * item and gated the caller as the collection owner; this service performs the
 * destructive work.
 *
 * 409 guard FIRST (pre-transaction): an item in ANY sort result is non-purgeable.
 * Then, children-first hard delete in ONE transaction (preferences + photos carry
 * the items FK, which has no ON DELETE CASCADE, so they must go before the item).
 * Blobs are cleaned up best-effort AFTER commit — orphaned blobs on a `del`
 * failure are inert and sweepable; a blob failure must never roll back a
 * committed DB delete.
 *
 * Invariant: inside the transaction, EVERY write goes through a tx-bound repo
 * (`new XRepository(tx)`), never an injected/`this.db` repo — a non-tx write
 * would not roll back with the transaction.
 */
export class ItemPurgeService {
  constructor(
    private db: Database,
    private sortResultItemRepo: SortResultItemRepository,
  ) {}

  async purge(itemId: string): Promise<void> {
    if (await this.sortResultItemRepo.existsByItem(itemId)) {
      throw new ItemInResultError();
    }

    const blobKeys = await withTransaction(this.db, async (tx) => {
      await new CollectionPreferenceItemRepository(tx).deleteByItem(itemId);
      const keys = await new PhotoRepository(tx).hardDeleteByItem(itemId);
      await new ItemRepository(tx).hardDelete(itemId);
      return keys;
    });

    // Best-effort, post-commit. Only http(s) blob keys are real blob URLs
    // (matches the photo DELETE route's guard); a `del` rejection is logged, not
    // fatal — the DB delete already committed.
    const results = await Promise.allSettled(
      blobKeys.filter((k) => k.startsWith("http")).map((k) => del(k)),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("ItemPurgeService: blob del failed (orphaned, sweepable)", r.reason);
      }
    }
  }
}
