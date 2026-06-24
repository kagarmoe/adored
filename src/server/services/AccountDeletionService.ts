import type { Database } from "@/lib/db";
import { withTransaction } from "@/lib/transactions";
import { accountTombstone } from "@/server/services/account-tombstone";
import { CollectionPurgeService } from "@/server/services/CollectionPurgeService";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

/**
 * Permanently erase a user's data and scrub their PII. Irreversible.
 *
 * Phase 1 — Owned collections (incl. SOFT-DELETED): each is purged via
 * `CollectionPurgeService.purge` (canonical child-first cascade + audit row +
 * blob del). Resolution uses `findByOwnerIncludingDeleted` so archived
 * collections are not skipped. ALL owned purges run first; if ANY throws, we
 * throw AFTER the loop — BEFORE the borrowed pass and BEFORE the PII scrub — so
 * the route returns 500 and the op is retryable with PII still intact. We never
 * scrub a user who still owns un-purged data.
 *
 * Phase 2 — Borrowed collections (the user is a curator in someone else's
 * collection). In ONE transaction, delete the user's curator-PRIVATE slice
 * child-first: sort_result_shares → sort_result_items → sort_results →
 * decision_events → sessions → preferences → memberships. The owner's own rows
 * are untouched.
 *
 * Phase 3 — Scrub SHARED content the user contributed into OTHER owners'
 * collections (must SURVIVE, only de-identified): photos' uploaded_by and any
 * invitation email matching the user → the tombstone. (Owned-collection photos
 * and invitations are already purged in phase 1, so these targets are
 * borrowed-only.)
 *
 * Phase 4 — User row + auth: `purgeAndScrub` (transactional) scrubs PII and
 * deletes account / session / verificationToken rows.
 */
export class AccountDeletionService {
  constructor(private db: Database) {}

  async deleteCurrentUser(userId: string): Promise<void> {
    // ---- Phase 1: owned collections (incl. soft-deleted) ----------------- //
    const ownedCollections = await new CollectionRepository(
      this.db,
    ).findByOwnerIncludingDeleted(userId);

    const purgeService = new CollectionPurgeService(this.db);
    const failures: Array<{ collectionId: string; error: unknown }> = [];

    for (const collection of ownedCollections) {
      try {
        // CollectionPurgeService cascades, writes the collection.purge audit row,
        // and dels blobs — reusing it fixes drift and restores the audit trail.
        await purgeService.purge(collection, userId);
      } catch (error) {
        failures.push({ collectionId: collection.id, error });
        console.error(
          `AccountDeletionService: purge failed for owned collection ${collection.id} (userId=${userId})`,
          error,
        );
      }
    }

    // Abort BEFORE the borrowed pass and BEFORE any PII scrub if any owned
    // collection failed to purge — the user still owns un-erased data, so the
    // op must surface a 500 and stay retryable with PII intact. We never scrub
    // a user who still owns un-purged data.
    if (failures.length > 0) {
      throw new Error(
        `Account deletion aborted: ${failures.length} owned collection(s) failed to purge ` +
          `(${failures.map((f) => f.collectionId).join(", ")}); PII left intact for retry.`,
      );
    }

    // ---- Phase 2: borrowed curator-private slice (one tx) ---------------- //
    // Child-first: shares + result-items are children of sort_results;
    // decision_events are children of sessions.
    await withTransaction(this.db, async (tx) => {
      await new SortResultShareRepository(tx).deleteByCurator(userId);
      await new SortResultItemRepository(tx).deleteByCurator(userId);
      await new SortResultRepository(tx).deleteByCurator(userId);
      await new DecisionEventRepository(tx).deleteByCurator(userId);
      await new SessionRepository(tx).deleteByCurator(userId);
      await new CollectionPreferenceItemRepository(tx).deleteByCurator(userId);
      // The user's disposition rows in OTHER owners' collections (curator-private
      // slice). The item_dispositions FK has no cascade; the borrowed item/collection
      // survive, so only this curator's rows are cleared.
      await new ItemDispositionRepository(tx).deleteByCurator(userId);
      await new MembershipRepository(tx).deleteByUser(userId);
    });

    // ---- Phase 3: scrub shared content in borrowed collections ----------- //
    // De-identify (do NOT delete) the user's photos and invitation email that
    // live in OTHER owners' collections — that content belongs to those owners.
    const tombstone = accountTombstone(userId);
    const oldUser = await new UserRepository(this.db).findById(userId);
    const oldEmail = oldUser?.email ?? null;

    await new PhotoRepository(this.db).scrubUploader(userId, tombstone);
    if (oldEmail) {
      await new InvitationRepository(this.db).scrubEmail(oldEmail, tombstone);
    }

    // ---- Phase 4: user row + auth (transactional) ----------------------- //
    await new UserRepository(this.db).purgeAndScrub(userId);

    // ---- Phase 5: account-level audit row -------------------------------- //
    // collectionId is NOT NULL with no FK — use a sentinel so this event is
    // attributable without a natural collection context (purses-obe0).
    // INVARIANT: never JOIN audit_log.collectionId → collections; "__account__"
    // is a sentinel for account-scoped events. It cannot collide with a
    // generatable collection id (those are prefixed ULIDs), so it never surfaces
    // in an owner's per-collection audit view (findByCollection).
    await new AuditLogRepository(this.db).record({
      actorId: userId,
      action: "account.delete",
      targetType: "user",
      targetId: userId,
      collectionId: "__account__",
      metadata: { ownedCollections: ownedCollections.length },
    });
  }
}
