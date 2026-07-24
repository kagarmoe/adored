import type { Database } from "@/lib/db";
import type { Item, RankBucket } from "@/types";
import { withTransaction } from "@/lib/transactions";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { TIER_SEED } from "@/server/services/ScoringService";

/**
 * The per-curator manual bin overlay write (purses-xxo7): a hand-set 1-of-4 bin is a
 * single-row overlay on live preferences, NOT a recompute. One lock-free transaction
 * per call — the SET upsert and the disposition clear (or the clear-overlay statement)
 * commit or roll back together.
 */
export class ItemBinService {
  constructor(private db: Database) {}

  static fromDb(db: Database): ItemBinService {
    return new ItemBinService(db);
  }

  /**
   * Set (bucket ≠ null) or clear (bucket = null) the caller's manual bin on `item`.
   * Returns the post-write effective bucket (`manualBucket ?? rankBucket`, or null when
   * a hand-only row was deleted / nothing was placed).
   */
  async setBin(
    item: Item,
    curatorId: string,
    bucket: RankBucket | null,
  ): Promise<RankBucket | null> {
    return withTransaction(
      this.db,
      async (tx): Promise<RankBucket | null> => {
        const prefRepo = new CollectionPreferenceItemRepository(tx);

        if (bucket === null) {
          // Clear: hand-only row deleted, sorted row's overlay nulled (ONE statement).
          await prefRepo.clearManualBucket(item.id, curatorId);
          const row = await prefRepo.findByItem(item.id, curatorId);
          return row ? row.manualBucket ?? row.rankBucket : null;
        }

        // Set: ONE lock-free upsert seeds a new hand-only row or overlays a sorted one.
        await prefRepo.setManualBucket({
          collectionId: item.collectionId,
          curatorId,
          itemId: item.id,
          bucket,
          seedScore: TIER_SEED[bucket],
        });
        // A placement clears any disposition (disposed <=> untriaged), mirroring the
        // decisions route's bringBack — else the item double-counts on home / sort-hub.
        await new ItemDispositionRepository(tx).delete(item.id, curatorId);
        return bucket;
      },
      { op: "set_item_bin", ctx: { collectionId: item.collectionId, curatorId, itemId: item.id } },
    );
  }
}
