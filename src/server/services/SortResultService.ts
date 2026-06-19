import type { SortResult, SortResultItem } from "@/types";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { Database } from "@/lib/db";
import { withTransaction } from "@/lib/transactions";
import {
  SortResultRepository,
  isResultNumberConflict,
} from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
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
    private sortResultRepo: ISortResultRepository,
    private sortResultItemRepo: ISortResultItemRepository,
    private preferenceRepo: ICollectionPreferenceItemRepository,
    private db: Database,
  ) {}

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
    return this.createResultWithItems(collectionId, curatorId, name, items);
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
            await itemRepo.create({ sortResultId: result.id, ...item });
          }
          return result;
        });
      } catch (error) {
        if (isResultNumberConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
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

  async deleteResultItem(id: string): Promise<void> {
    await this.sortResultItemRepo.delete(id);
  }

  async finalizeResult(id: string): Promise<SortResult> {
    return this.sortResultRepo.update(id, {
      status: "finalized",
      finalizedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async supersedeResult(id: string): Promise<SortResult | null> {
    const source = await this.sortResultRepo.findById(id);
    if (!source) return null;
    if (source.status !== "finalized") throw new SupersedeStateError();

    // Source is finalized/immutable, so reading its items pre-tx is benign.
    const sourceItems = await this.sortResultItemRepo.findByResult(id);
    const items = cloneItemsFrom(sourceItems);
    return this.createResultWithItems(
      source.collectionId,
      source.curatorId,
      `${source.name} (Revision)`,
      items,
    );
  }

  /**
   * Hard-delete a DRAFT result and its items. Children first: the
   * sort_result_items -> sort_results FK has no ON DELETE CASCADE, so a bare
   * result delete would FK-violate on a populated draft. No transaction (the
   * codebase uses none; a single-curator draft delete is FK-safe and
   * recoverable by re-running the sort).
   *
   * Returns false when the result is absent (route -> 404); throws
   * DeleteResultStateError when the result is not a draft (route -> 409).
   */
  async deleteResult(id: string): Promise<boolean> {
    const result = await this.sortResultRepo.findById(id);
    if (!result) return false;
    if (result.status !== "draft") throw new DeleteResultStateError();

    await this.sortResultItemRepo.deleteByResult(id);
    await this.sortResultRepo.delete(id);
    return true;
  }
}
