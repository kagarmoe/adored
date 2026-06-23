import { del } from "@vercel/blob";
import type { Database } from "@/lib/db";
import { withTransaction } from "@/lib/transactions";
import { deleteVariants, variantPrefix } from "@/lib/photo-variants";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";

/**
 * Permanently erase a user's data and scrub their PII.
 *
 * Owned collections: full children-first cascade in one `withTransaction` per
 * collection (mirrors CollectionPurgeService). No FK has ON DELETE CASCADE, so
 * the order is: sort_result_shares → sort_result_items → sort_results →
 * decision_events → sessions → preferences → photos → items → invitations →
 * memberships → collection. Partial failure (a later collection's tx fails) is
 * acceptable per spec — it is logged and the rest continue.
 *
 * Borrowed collections (curator in another owner's collection): delete the
 * user's curator-scoped slice child-first across ALL collections in one pass:
 * sort_result_shares (by curator) → sort_result_items (by curator) →
 * sort_results (by curator) → decision_events (by curator) → sessions (by
 * curator) → preferences (by curator) → memberships (by user). The owner's
 * own rows in those collections are NOT touched.
 *
 * User row + auth: `purgeAndScrub` scrubs PII and hard-deletes account /
 * session / verificationToken rows.
 *
 * Blobs: best-effort `del` AFTER commit (a failure is logged, never fatal).
 */
export class AccountDeletionService {
  constructor(private db: Database) {}

  async deleteCurrentUser(userId: string): Promise<void> {
    // ------------------------------------------------------------------ //
    // 1. Owned collections — full cascade, one tx per collection           //
    // ------------------------------------------------------------------ //
    const ownedCollections = await new CollectionRepository(this.db).findByOwner(userId);
    const allBlobKeys: string[] = [];
    const allVariantPrefixes: string[] = [];

    for (const collection of ownedCollections) {
      try {
        const keys = await withTransaction(this.db, async (tx) => {
          await new SortResultShareRepository(tx).deleteByCollection(collection.id);
          await new SortResultItemRepository(tx).deleteByCollection(collection.id);
          await new SortResultRepository(tx).deleteByCollection(collection.id);
          await new DecisionEventRepository(tx).deleteByCollection(collection.id);
          await new SessionRepository(tx).deleteByCollection(collection.id);
          await new CollectionPreferenceItemRepository(tx).deleteByCollection(collection.id);
          const blobKeys = await new PhotoRepository(tx).hardDeleteByCollection(collection.id);
          await new ItemRepository(tx).hardDeleteByCollection(collection.id);
          await new InvitationRepository(tx).deleteByCollection(collection.id);
          await new MembershipRepository(tx).deleteByCollection(collection.id);
          await new CollectionRepository(tx).hardDelete(collection.id);
          return blobKeys;
        });
        allBlobKeys.push(...keys);
        allVariantPrefixes.push(variantPrefix(collection.id));
      } catch (err) {
        // Partial failure: log and continue with remaining collections.
        // The spec explicitly permits this ("acceptable per spec, log it").
        console.error(
          `AccountDeletionService: cascade failed for owned collection ${collection.id} (userId=${userId}); continuing`,
          err,
        );
      }
    }

    // ------------------------------------------------------------------ //
    // 2. Borrowed collections — curator-scoped slice, one cross-collection //
    //    pass per table (child-first to respect no-cascade FKs)            //
    // ------------------------------------------------------------------ //
    // Order: shares → result-items → sort-results (share+item are children of
    // sort_result); then decision-events → sessions (decision is child of
    // session); then preferences; then memberships.
    await new SortResultShareRepository(this.db).deleteByCurator(userId);
    await new SortResultItemRepository(this.db).deleteByCurator(userId);
    await new SortResultRepository(this.db).deleteByCurator(userId);
    await new DecisionEventRepository(this.db).deleteByCurator(userId);
    await new SessionRepository(this.db).deleteByCurator(userId);
    await new CollectionPreferenceItemRepository(this.db).deleteByCurator(userId);
    await new MembershipRepository(this.db).deleteByUser(userId);

    // ------------------------------------------------------------------ //
    // 3. User row + auth tables — scrub PII, delete tokens                 //
    // ------------------------------------------------------------------ //
    await new UserRepository(this.db).purgeAndScrub(userId);

    // ------------------------------------------------------------------ //
    // 4. Blobs — best-effort, post-commit                                  //
    // ------------------------------------------------------------------ //
    const httpKeys = allBlobKeys.filter((k) => k.startsWith("http"));
    const blobResults = await Promise.allSettled(httpKeys.map((k) => del(k)));
    for (const r of blobResults) {
      if (r.status === "rejected") {
        console.error(
          "AccountDeletionService: blob del failed (orphaned, sweepable)",
          r.reason,
        );
      }
    }

    // Best-effort: sweep resized variants for every purged owned collection.
    await Promise.allSettled(allVariantPrefixes.map((p) => deleteVariants(p)));
  }
}
