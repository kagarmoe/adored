import type { SortResult, SortResultItem } from "@/types";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";

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
}
