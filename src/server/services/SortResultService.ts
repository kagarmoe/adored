import type { SortResult, SortResultItem, RankBucket } from "@/types";
import type { Database } from "@/lib/db";
import { withTransaction } from "@/lib/transactions";
import {
  SortResultRepository,
  isResultNumberConflict,
} from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { loadCuratorDecisionEvents } from "@/server/services/decision-log";
import { deriveUsage, type UsageAnswer } from "@/lib/derive-usage";
import {
  rankPreferencesToItems,
  cloneItemsFrom,
  type MaterializedItem,
} from "./sortResultMaterialization";

/** Thrown when supersede targets a result that is not finalized; the route maps it to 409. */
export class SupersedeStateError extends Error {
  constructor() {
    super("Can only supersede finalized results");
    this.name = "SupersedeStateError";
  }
}

/** Thrown when delete targets a result that is not a draft; the route maps it to 409. */
export class DeleteResultStateError extends Error {
  constructor() {
    super("Can only delete draft results");
    this.name = "DeleteResultStateError";
  }
}

/** Thrown when finalize targets a result that is already finalized; the route maps it to 409. */
export class FinalizeStateError extends Error {
  constructor() {
    super("Can only finalize draft results");
    this.name = "FinalizeStateError";
  }
}

/**
 * Thrown when a re-rank or reset targets a result that is no longer a draft.
 * Re-asserted INSIDE the write transaction (after a FOR UPDATE row lock), so a
 * finalize that commits between the route's pre-tx status check and the write
 * (the finalized-immutability TOCTOU) can no longer slip a manual-overlay change
 * onto a finalized keepsake. The route maps it to 409 (same as the pre-tx gate).
 */
export class ReorderFinalizedError extends Error {
  constructor() {
    super("Result is finalized");
    this.name = "ReorderFinalizedError";
  }
}

/**
 * Thrown when a bulk re-rank batch names a rid that is not an item of the target
 * result (a foreign/absent rid). Raised INSIDE the reorder transaction so the
 * whole batch rolls back; the route maps it to 404 (mirrors the per-item route's
 * "result-item belongs to a different result" 404).
 */
export class ResultItemNotInResultError extends Error {
  constructor() {
    super("Result item does not belong to this result");
    this.name = "ResultItemNotInResultError";
  }
}

/**
 * Thrown when the (collection, number) race could not be won within the retry
 * budget. Distinct from a mid-transaction failure so ops can tell "retry storm
 * lost" apart from "DB fell over". The route maps it to 500.
 */
export class ResultNumberExhaustedError extends Error {
  constructor() {
    super("Could not allocate a result number");
    this.name = "ResultNumberExhaustedError";
  }
}

export class SortResultService {
  constructor(
    private sortResultRepo: SortResultRepository,
    private sortResultItemRepo: SortResultItemRepository,
    private preferenceRepo: CollectionPreferenceItemRepository,
    private db: Database,
  ) {}

  static fromDb(db: Database): SortResultService {
    return new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );
  }

  async createDraftResult(
    collectionId: string,
    curatorId: string,
    name: string,
  ): Promise<SortResult> {
    const preferences = await this.preferenceRepo.findByCollection(
      collectionId,
      curatorId,
    );
    const items = rankPreferencesToItems(preferences);
    // Epic S: snapshot the LIVE usage fold at materialization — the same
    // deriveUsage a revision re-runs (§3.3 fresh-fold), so a draft records usage
    // as of the moment it was materialized.
    const usageByItemId = await this.deriveCuratorUsage(collectionId, curatorId, items);
    // Materialize the NEW draft from CURRENT live prefs FIRST (fresh-at-finalize:
    // supersede-and-recreate, never reuse-stale), then reap the curator's PRIOR
    // unfinalized drafts so at most one draft exists per (collection, curator).
    const result = await this.createResultWithItems(collectionId, curatorId, name, items, usageByItemId);
    await this.supersedePriorDrafts(collectionId, curatorId, result.id);
    return result;
  }

  /**
   * Epic S: derive the curator's usage standing for the items being materialized,
   * from their CURRENT cross-session decision log (the SAME log the Standing
   * surface reads — loadCuratorDecisionEvents). Called by every materialization
   * path (fresh draft + revision), so a revision re-derives usage at its own
   * moment (fresh-fold) rather than carrying the original snapshot forward. A
   * usage-unknown item is simply absent from the map → stamped NULL.
   */
  private async deriveCuratorUsage(
    collectionId: string,
    curatorId: string,
    items: MaterializedItem[],
  ): Promise<Map<string, UsageAnswer>> {
    const events = await loadCuratorDecisionEvents(
      new SessionRepository(this.db),
      new DecisionEventRepository(this.db),
      collectionId,
      curatorId,
    );
    return deriveUsage(events, new Set(items.map((i) => i.itemId)));
  }

  /**
   * Delete every UNFINALIZED draft for (collection, curator) EXCEPT the one just
   * created (purses-p2rj): each abandoned Finalize click POSTs a new draft, so
   * without this reap orphan "Draft result" rows accumulate. FINALIZED snapshots
   * are never matched (findDrafts filters status='draft'), keeping the Epic 5b
   * frozen invariant intact. Each old draft's items are deleted first (the FK has
   * no ON DELETE CASCADE), row + items atomically per draft.
   */
  private async supersedePriorDrafts(
    collectionId: string,
    curatorId: string,
    keepId: string,
  ): Promise<void> {
    const drafts = await this.sortResultRepo.findDrafts(collectionId, curatorId);
    const stale = drafts.filter((d) => d.id !== keepId);
    for (const draft of stale) {
      await withTransaction(this.db, async (tx) => {
        await new SortResultItemRepository(tx).deleteByResult(draft.id);
        await new SortResultRepository(tx).delete(draft.id);
      });
    }
  }

  /**
   * The one transactional materialization primitive, reused by create + supersede.
   * Writes the result row + all item rows ATOMICALLY: a mid-materialization
   * failure rolls the whole transaction back, leaving no result and no items.
   *
   * Invariant: every write inside the transaction goes to tx-bound repos
   * (`new SortResultRepository(tx)` / `new SortResultItemRepository(tx)`), never
   * the injected `this.sortResultRepo`/`this.sortResultItemRepo` — a non-tx
   * write would not roll back.
   *
   * The (collection, number) race aborts the whole transaction, so it is retried
   * at the transaction boundary, recomputing the number each attempt, gated on
   * the SINGLE `isResultNumberConflict` predicate (shared with the repo wrapper).
   * Exhaustion after 5 attempts throws ResultNumberExhaustedError.
   */
  private async createResultWithItems(
    collectionId: string,
    curatorId: string,
    name: string,
    items: MaterializedItem[],
    usageByItemId: ReadonlyMap<string, UsageAnswer>,
  ): Promise<SortResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await withTransaction(this.db, async (tx) => {
          const resultRepo = new SortResultRepository(tx);
          const itemRepo = new SortResultItemRepository(tx);
          const number = await resultRepo.getNextResultNumber(collectionId);
          const result = await resultRepo.insertWithNumber({
            collectionId,
            curatorId,
            name,
            status: "draft",
            number,
          });
          for (const item of items) {
            // Epic S: stamp usage at the materialization step (not the clone), so
            // the snapshot records the fold passed in by the caller.
            await itemRepo.create({
              sortResultId: result.id,
              ...item,
              usage: usageByItemId.get(item.itemId) ?? null,
            });
          }
          return result;
        }, { op: "materialize_result", ctx: { collectionId, curatorId } });
      } catch (error) {
        if (isResultNumberConflict(error)) {
          if (attempt < 4) continue;
          throw new ResultNumberExhaustedError();
        }
        throw error;
      }
    }
    // Defensive fallback for TS's return-type analysis; unreachable in practice
    // (the final-attempt conflict throws above; success returns from the try).
    throw new ResultNumberExhaustedError();
  }

  async getDraftResult(collectionId: string, curatorId: string): Promise<SortResult | null> {
    return this.sortResultRepo.findDraft(collectionId, curatorId);
  }

  async getResult(id: string): Promise<{ result: SortResult; items: SortResultItem[] } | null> {
    const result = await this.sortResultRepo.findById(id);
    if (!result) return null;

    const items = await this.sortResultItemRepo.findByResult(id);
    return { result, items };
  }

  async updateResultName(id: string, name: string): Promise<SortResult> {
    return this.sortResultRepo.update(id, {
      name,
      updatedAt: new Date(),
    });
  }

  async setManualOverride(
    resultItemId: string,
    rank?: number,
    bucket?: "top" | "high" | "medium" | "low",
  ): Promise<SortResultItem> {
    return this.sortResultItemRepo.update(resultItemId, {
      manualRank: rank ?? null,
      manualBucket: bucket ?? null,
      updatedAt: new Date(),
    });
  }

  async resetManualOverride(resultItemId: string): Promise<SortResultItem> {
    return this.sortResultItemRepo.update(resultItemId, {
      manualRank: null,
      manualBucket: null,
      updatedAt: new Date(),
    });
  }

  /**
   * Epic S S3a: apply a whole ordering — an array of {rid, manualRank} — in ONE
   * transaction, so a drag-to-position (a dense, gapless rewrite of the affected
   * block) is a SINGLE atomic call instead of N fragile sequential PATCHes.
   *
   * `manualRank` is a dense int sharing numeric space with `computedRank`, so the
   * caller passes the full new rank sequence for the moved block. EVERY rid is
   * validated against the result's own items INSIDE the transaction: a bad rid
   * throws ResultItemNotInResultError, which rolls back any writes already applied
   * in this batch (the load-bearing atomicity guarantee — no partial reorder).
   *
   * Invariant: all writes go to the tx-bound repo, never `this.sortResultItemRepo`.
   */
  async reorderResultItems(
    resultId: string,
    order: ReadonlyArray<{ rid: string; manualRank: number; manualBucket: RankBucket | null }>,
  ): Promise<SortResultItem[]> {
    return withTransaction(
      this.db,
      async (tx) => {
        // Lock the result row and re-assert draft status IN-TX: a finalize that
        // committed after the route's pre-tx 409 gate now serializes here, so a
        // re-rank can never land on a finalized keepsake (TOCTOU).
        const result = await new SortResultRepository(tx).findByIdForUpdate(resultId);
        if (result && result.status !== "draft") throw new ReorderFinalizedError();
        const itemRepo = new SortResultItemRepository(tx);
        const validIds = new Set(
          (await itemRepo.findByResult(resultId)).map((i) => i.id),
        );
        // 9v1f.1 cross-tier: write manualBucket alongside manualRank. `?? null` so
        // an undefined can never make drizzle skip the column and strand a prior
        // override — the batch is a FULL overlay describing every row's manual state.
        for (const { rid, manualRank, manualBucket } of order) {
          if (!validIds.has(rid)) throw new ResultItemNotInResultError();
          await itemRepo.update(rid, { manualRank, manualBucket: manualBucket ?? null });
        }
        return itemRepo.findByResult(resultId);
      },
      { op: "reorder_result_items", ctx: { resultId } },
    );
  }

  /**
   * Epic S S3a: clear the manual overlay for EVERY item of a result — back to the
   * suggested order. Runs in a transaction that FIRST locks the result row and
   * re-asserts draft status (the same finalized-immutability TOCTOU guard as
   * reorderResultItems), so a concurrent finalize serializes with the reset.
   */
  async resetManualOverridesForResult(resultId: string): Promise<SortResultItem[]> {
    return withTransaction(
      this.db,
      async (tx) => {
        const result = await new SortResultRepository(tx).findByIdForUpdate(resultId);
        if (result && result.status !== "draft") throw new ReorderFinalizedError();
        const itemRepo = new SortResultItemRepository(tx);
        await itemRepo.clearManualOverridesByResult(resultId);
        return itemRepo.findByResult(resultId);
      },
      { op: "reset_result_items", ctx: { resultId } },
    );
  }

  async deleteResultItem(id: string): Promise<void> {
    await this.sortResultItemRepo.delete(id);
  }

  /**
   * Finalize a draft into an immutable snapshot AND close the pass it belongs
   * to (spec §E, "sessions as invisible bookkeeping"): both writes commit or
   * roll back together in ONE transaction. `sort_results` carries no
   * sessionId — a result can be finalized from any of the curator's sessions —
   * so the curator's currently open (active|paused) session for the result's
   * collection is resolved AT FINALIZE TIME, by (collectionId, curatorId). No
   * open session is not an error: the result finalizes alone.
   *
   * The result row is locked (`findByIdForUpdate`) inside the transaction so a
   * concurrent finalize serializes here instead of racing the state guard
   * (mirrors `reorderResultItems`' TOCTOU pattern).
   */
  async finalizeResult(id: string): Promise<SortResult> {
    return withTransaction(
      this.db,
      async (tx) => {
        const resultRepo = new SortResultRepository(tx);
        const result = await resultRepo.findByIdForUpdate(id);
        if (!result) throw new Error("Result not found");
        if (result.status === "finalized") throw new FinalizeStateError();

        const finalized = await resultRepo.update(id, {
          status: "finalized",
          finalizedAt: new Date(),
        });

        const sessionRepo = new SessionRepository(tx);
        const openSession = await sessionRepo.findInProgress(
          result.collectionId,
          result.curatorId,
        );
        if (openSession) {
          await sessionRepo.update(openSession.id, { status: "completed" });
        }

        return finalized;
      },
      { op: "finalize_result", ctx: { resultId: id } },
    );
  }

  async supersedeResult(id: string): Promise<SortResult | null> {
    const source = await this.sortResultRepo.findById(id);
    if (!source) return null;
    if (source.status !== "finalized") throw new SupersedeStateError();

    // Source is finalized/immutable, so reading its items pre-tx is benign.
    const sourceItems = await this.sortResultItemRepo.findByResult(id);
    const items = cloneItemsFrom(sourceItems);
    // Epic S fresh-fold (§3.3): the clone drops manual overrides AND does not
    // carry usage; usage is RE-DERIVED from the curator's CURRENT decision log
    // here, so the revision's snapshot describes the revision moment — not the
    // usage frozen into the original keepsake.
    const usageByItemId = await this.deriveCuratorUsage(
      source.collectionId,
      source.curatorId,
      items,
    );
    return this.createResultWithItems(
      source.collectionId,
      source.curatorId,
      `${source.name} (Revision)`,
      items,
      usageByItemId,
    );
  }

  /**
   * Hard-delete a DRAFT result and its items, ATOMICALLY via withTransaction:
   * children first (the sort_result_items -> sort_results FK has no
   * ON DELETE CASCADE), so the two deletes commit or roll back together and a
   * mid-delete failure leaves nothing changed (purses-nea established the
   * transaction pattern; prod runs postgres-js).
   *
   * Returns false when the result is absent (route -> 404); throws
   * DeleteResultStateError when the result is not a draft (route -> 409).
   */
  async deleteResult(id: string): Promise<boolean> {
    const result = await this.sortResultRepo.findById(id);
    if (!result) return false;
    if (result.status !== "draft") throw new DeleteResultStateError();

    await withTransaction(this.db, async (tx) => {
      await new SortResultItemRepository(tx).deleteByResult(id);
      await new SortResultRepository(tx).delete(id);
    });
    return true;
  }

  /**
   * Owner-only purge-prep: detach an item from every DRAFT result it sits in
   * (across all curators), in one transaction, then report how many FINALIZED
   * results still reference it. The deliberate t9l exception — purge is a
   * collection-owner op, so clearing draft sorts is its necessary consequence;
   * finalized results stay immutable and preferences are untouched.
   *
   * Invariant: every write inside the transaction goes to the tx-bound repo, not
   * the injected `this.sortResultItemRepo`. The finalized count runs in the same
   * transaction so `removed`/`remainingInFinalized` are a consistent snapshot.
   */
  async removeItemFromDraftResults(
    itemId: string,
  ): Promise<{ removed: number; remainingInFinalized: number }> {
    return withTransaction(this.db, async (tx) => {
      const repo = new SortResultItemRepository(tx);
      const removed = await repo.deleteByItemInDraftResults(itemId);
      const remainingInFinalized = await repo.countByItemInFinalizedResults(itemId);
      return { removed, remainingInFinalized };
    });
  }
}
