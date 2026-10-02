import { randomBytes } from "crypto";
import type { SortResult, SortResultItem } from "@/types";
import type { Database } from "@/lib/db";
import { lockCollectionCurator, lockSaveKey, withTransaction } from "@/lib/transactions";
import {
  SortResultRepository,
  isResultNumberConflict,
} from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { loadCuratorDecisionEvents } from "@/server/services/decision-log";
import { deriveUsage, type UsageAnswer } from "@/lib/derive-usage";
import {
  rankPreferencesToItems,
  cloneItemsFrom,
  buildRanking,
  pinsFromRows,
  savedOrderPositions,
  type MaterializedItem,
  type Pin,
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

/** The open draft's name until Save and share names it. */
export const OPEN_DRAFT_NAME = "Still deciding";

/** Pin target is not a Love/Like/Maybe piece of this curator in this collection → 404. */
export class PinTargetError extends Error {
  constructor() {
    super("That piece can't be placed here.");
    this.name = "PinTargetError";
  }
}

/** Nothing is ranked yet → 409 (the button is hidden then; this is the direct-API net). */
export class NothingToSaveError extends Error {
  constructor() {
    super("There's nothing to save yet — sort a few first.");
    this.name = "NothingToSaveError";
  }
}

/** A save key reused for another collection, or whose link was revoked → 409. */
export class SaveKeyConflictError extends Error {
  constructor() {
    super("That save can't be repeated here.");
    this.name = "SaveKeyConflictError";
  }
}

export interface SavedRanking {
  result: SortResult;
  shareToken: string;
  created: boolean;
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

  async createDraftResult(collectionId: string, curatorId: string, name: string): Promise<SortResult> {
    const preferences = await this.preferenceRepo.findByCollection(collectionId, curatorId);
    const items = rankPreferencesToItems(preferences);
    const usageByItemId = await this.deriveCuratorUsage(collectionId, curatorId, items);
    // One open draft per (collection, curator) (sort_results_open_draft_unique): the
    // prior draft is reaped INSIDE the same locked transaction, before the insert,
    // so the index never sees two and a failure leaves the old draft in place.
    return this.inCuratorTx(collectionId, curatorId, "materialize_result", async (tx) => {
      await this.deleteDrafts(tx, collectionId, curatorId);
      return this.insertResultWithItems(tx, collectionId, curatorId, name, items, usageByItemId);
    });
  }

  /**
   * Every draft writer runs here: one transaction holding the (collection, curator)
   * advisory lock, so pin / unpin / save / revision / legacy create serialize and
   * the open-draft index is a backstop, never a 500. The (collection, number) race
   * (another curator saving in the same collection) aborts the transaction, so it is
   * retried at this boundary, up to 5 attempts.
   */
  private async inCuratorTx<T>(
    collectionId: string,
    curatorId: string,
    op: string,
    fn: (tx: Database) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await withTransaction(
          this.db,
          async (tx) => {
            await lockCollectionCurator(tx, collectionId, curatorId);
            return fn(tx);
          },
          { op, ctx: { collectionId, curatorId } },
        );
      } catch (error) {
        if (!isResultNumberConflict(error)) throw error;
        if (attempt === 4) throw new ResultNumberExhaustedError();
      }
    }
    throw new ResultNumberExhaustedError();
  }

  /** Lazily open the one draft (spec §4.3) — an empty row; pins add their own rows. */
  private async getOrCreateOpenDraft(tx: Database, collectionId: string, curatorId: string): Promise<SortResult> {
    const repo = new SortResultRepository(tx);
    const open = await repo.findDraftForUpdate(collectionId, curatorId);
    if (open) return open;
    const number = await repo.getNextResultNumber(collectionId);
    return repo.insertWithNumber({ collectionId, curatorId, name: OPEN_DRAFT_NAME, status: "draft", number });
  }

  /** Children first: neither the shares nor the items FK has ON DELETE CASCADE. */
  private async deleteDrafts(tx: Database, collectionId: string, curatorId: string): Promise<void> {
    const resultRepo = new SortResultRepository(tx);
    const itemRepo = new SortResultItemRepository(tx);
    const shareRepo = new SortResultShareRepository(tx);
    for (const draft of await resultRepo.findDrafts(collectionId, curatorId)) {
      await shareRepo.deleteByResult(draft.id);
      await itemRepo.deleteByResult(draft.id);
      await resultRepo.delete(draft.id);
    }
  }

  // Invariant: tx-bound repos only — a write on this.sortResultRepo would not roll back.
  private async insertResultWithItems(
    tx: Database,
    collectionId: string,
    curatorId: string,
    name: string,
    items: MaterializedItem[],
    usageByItemId: ReadonlyMap<string, UsageAnswer>,
  ): Promise<SortResult> {
    const resultRepo = new SortResultRepository(tx);
    const itemRepo = new SortResultItemRepository(tx);
    const number = await resultRepo.getNextResultNumber(collectionId);
    const result = await resultRepo.insertWithNumber({ collectionId, curatorId, name, status: "draft", number });
    for (const item of items) {
      await itemRepo.create({ sortResultId: result.id, ...item, usage: usageByItemId.get(item.itemId) ?? null });
    }
    return result;
  }

  /** The open draft's pins (read-only — viewing the ranking creates nothing). */
  async listPins(collectionId: string, curatorId: string): Promise<Pin[]> {
    const draft = await this.sortResultRepo.findDraft(collectionId, curatorId);
    if (!draft) return [];
    return pinsFromRows(await this.sortResultItemRepo.findByResult(draft.id));
  }

  /** Hand-place one piece (spec §4 "Adjusting"); the first pin opens the draft. */
  async pinItem(collectionId: string, curatorId: string, itemId: string, position: number): Promise<void> {
    await this.inCuratorTx(collectionId, curatorId, "pin_ranking_item", async (tx) => {
      const pref = await new CollectionPreferenceItemRepository(tx).findByItem(itemId, curatorId);
      if (!pref || pref.collectionId !== collectionId || pref.rankBucket === "low") throw new PinTargetError();
      const draft = await this.getOrCreateOpenDraft(tx, collectionId, curatorId);
      const itemRepo = new SortResultItemRepository(tx);
      const row =
        (await itemRepo.findByResultAndItem(draft.id, itemId)) ??
        (await itemRepo.create({ sortResultId: draft.id, itemId, computedRank: position - 1, computedBucket: pref.rankBucket }));
      // manualRank is 0-based (existing convention); the API position is 1-based.
      await itemRepo.update(row.id, { manualRank: position - 1, manualBucket: null });
    });
  }

  /** Unpin: the piece returns to its derived place. Idempotent; opens nothing. */
  async unpinItem(collectionId: string, curatorId: string, itemId: string): Promise<void> {
    await this.inCuratorTx(collectionId, curatorId, "unpin_ranking_item", async (tx) => {
      const draft = await new SortResultRepository(tx).findDraftForUpdate(collectionId, curatorId);
      if (!draft) return;
      const itemRepo = new SortResultItemRepository(tx);
      const row = await itemRepo.findByResultAndItem(draft.id, itemId);
      if (row && row.manualRank !== null) await itemRepo.update(row.id, { manualRank: null, manualBucket: null });
    });
  }

  /**
   * Spec §4.4: ONE transaction — reuse-or-create the open draft, rebuild its rows
   * from the live ranking (pins applied, usage stamped), finalize it, close the
   * curator's open session, create the share link. Idempotent on `saveKey`: a
   * replay returns the same result and link and writes nothing.
   */
  async saveAndShare(collectionId: string, curatorId: string, name: string, saveKey: string): Promise<SavedRanking> {
    return this.inCuratorTx(collectionId, curatorId, "save_and_share", async (tx) => {
      // Same key in two collections takes two curator locks; this one serializes them so the loser 409s, not 500s.
      await lockSaveKey(tx, curatorId, saveKey);
      const resultRepo = new SortResultRepository(tx);
      const shareRepo = new SortResultShareRepository(tx);

      const replay = await resultRepo.findBySaveKey(curatorId, saveKey);
      if (replay) {
        const share = (await shareRepo.findByResult(replay.id)).find((s) => s.status === "active");
        if (replay.collectionId !== collectionId || !share) throw new SaveKeyConflictError();
        return { result: replay, shareToken: share.shareToken, created: false };
      }

      const liveIds = new Set((await new ItemRepository(tx).findByCollection(collectionId)).map((i) => i.id));
      const preferences = await new CollectionPreferenceItemRepository(tx).findByCollection(collectionId, curatorId);
      const draft = await this.getOrCreateOpenDraft(tx, collectionId, curatorId);
      const itemRepo = new SortResultItemRepository(tx);
      const pins = pinsFromRows(await itemRepo.findByResult(draft.id));
      const { loved, onward } = buildRanking(preferences, liveIds, pins);
      const ordered = [...loved, ...onward];
      if (ordered.length === 0) throw new NothingToSaveError();

      const events = await loadCuratorDecisionEvents(new SessionRepository(tx), new DecisionEventRepository(tx), collectionId, curatorId);
      const usage = deriveUsage(events, new Set(ordered.map((e) => e.itemId)));
      await itemRepo.deleteByResult(draft.id);
      for (const [index, entry] of ordered.entries()) {
        await itemRepo.create({
          sortResultId: draft.id,
          itemId: entry.itemId,
          computedRank: index,
          computedBucket: entry.bucket,
          usage: usage.get(entry.itemId) ?? null,
        });
      }
      const result = await resultRepo.markSaved(draft.id, name, saveKey);

      const sessionRepo = new SessionRepository(tx);
      const open = await sessionRepo.findInProgress(collectionId, curatorId);
      if (open) await sessionRepo.update(open.id, { status: "completed" });

      const shareToken = randomBytes(32).toString("hex");
      await shareRepo.create({ sortResultId: result.id, shareToken });
      return { result, shareToken, created: true };
    });
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
   * (the finalized-immutability TOCTOU guard).
   */
  async finalizeResult(id: string): Promise<SortResult> {
    // The pre-tx read only supplies the lock key (collection and curator never change);
    // status is re-asserted under the lock, so a concurrent save serializes ahead of us.
    const owner = await this.sortResultRepo.findById(id);
    if (!owner) throw new Error("Result not found");
    return this.inCuratorTx(owner.collectionId, owner.curatorId, "finalize_result", async (tx) => {
      const resultRepo = new SortResultRepository(tx);
      const result = await resultRepo.findByIdForUpdate(id);
      if (!result) throw new Error("Result not found");
      if (result.status === "finalized") throw new FinalizeStateError();

      const finalized = await resultRepo.update(id, {
        status: "finalized",
        finalizedAt: new Date(),
      });

      const sessionRepo = new SessionRepository(tx);
      const openSession = await sessionRepo.findInProgress(result.collectionId, result.curatorId);
      if (openSession) {
        await sessionRepo.update(openSession.id, { status: "completed" });
      }

      return finalized;
    });
  }

  async supersedeResult(id: string): Promise<SortResult | null> {
    const source = await this.sortResultRepo.findById(id);
    if (!source) return null;
    if (source.status !== "finalized") throw new SupersedeStateError();

    // Source is finalized/immutable, so reading its items pre-tx is benign.
    const sourceItems = await this.sortResultItemRepo.findByResult(id);
    const items = cloneItemsFrom(sourceItems);
    const usageByItemId = await this.deriveCuratorUsage(source.collectionId, source.curatorId, items);
    // Spec §4.4 "Make a revision opens a new copy to adjust": the copy becomes THE open
    // draft (replacing any other) with the saved loved order pinned, so the live
    // Ranking shows the saved order until the person moves or unpins something.
    const positions = savedOrderPositions(sourceItems);
    return this.inCuratorTx(source.collectionId, source.curatorId, "supersede_result", async (tx) => {
      await this.deleteDrafts(tx, source.collectionId, source.curatorId);
      const revision = await this.insertResultWithItems(
        tx, source.collectionId, source.curatorId, `${source.name} (Revision)`, items, usageByItemId,
      );
      const itemRepo = new SortResultItemRepository(tx);
      for (const row of await itemRepo.findByResult(revision.id)) {
        const position = positions.get(row.itemId);
        if (position !== undefined) await itemRepo.update(row.id, { manualRank: position - 1, manualBucket: null });
      }
      return revision;
    });
  }

  /**
   * Hard-delete a DRAFT result and its items, ATOMICALLY under the curator lock:
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

    // Status re-asserted under the lock: a save that finalized this draft meanwhile wins.
    return this.inCuratorTx(result.collectionId, result.curatorId, "delete_result", async (tx) => {
      const resultRepo = new SortResultRepository(tx);
      const locked = await resultRepo.findByIdForUpdate(id);
      if (!locked) return false;
      if (locked.status !== "draft") throw new DeleteResultStateError();
      await new SortResultItemRepository(tx).deleteByResult(id);
      await resultRepo.delete(id);
      return true;
    });
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
