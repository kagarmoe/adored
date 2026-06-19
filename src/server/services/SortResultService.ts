import type { SortResult, SortResultItem } from "@/types";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";

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

export class SortResultService {
  constructor(
    private sortResultRepo: ISortResultRepository,
    private sortResultItemRepo: ISortResultItemRepository,
    private preferenceRepo: ICollectionPreferenceItemRepository,
  ) {}

  async createDraftResult(
    collectionId: string,
    curatorId: string,
    name: string,
  ): Promise<SortResult> {
    const result = await this.sortResultRepo.create({
      collectionId,
      curatorId,
      name,
      status: "draft",
    });

    const preferences = await this.preferenceRepo.findByCollection(
      collectionId,
      curatorId,
    );

    const rankedItems = preferences
      .sort((a, b) => b.score - a.score)
      .map((pref, index) => ({
        itemId: pref.itemId,
        rank: index,
        bucket: pref.rankBucket,
      }));

    for (const item of rankedItems) {
      await this.sortResultItemRepo.create({
        sortResultId: result.id,
        itemId: item.itemId,
        computedRank: item.rank,
        computedBucket: item.bucket,
      });
    }

    return result;
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

  async finalizeResult(id: string): Promise<SortResult> {
    return this.sortResultRepo.update(id, {
      status: "finalized",
      finalizedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async supersedeResult(id: string): Promise<SortResult | null> {
    const oldResult = await this.sortResultRepo.findById(id);
    if (!oldResult) return null;
    if (oldResult.status !== "finalized") throw new SupersedeStateError();

    const newResult = await this.sortResultRepo.create({
      collectionId: oldResult.collectionId,
      curatorId: oldResult.curatorId,
      name: `${oldResult.name} (Revision)`,
      status: "draft",
    });

    const items = await this.sortResultItemRepo.findByResult(id);
    for (const item of items) {
      await this.sortResultItemRepo.create({
        sortResultId: newResult.id,
        itemId: item.itemId,
        computedRank: item.computedRank,
        computedBucket: item.computedBucket,
      });
    }

    return newResult;
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
