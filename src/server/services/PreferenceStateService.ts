import type { CollectionPreferenceItem } from "@/types";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { ScoringService } from "@/server/services/ScoringService";

export class PreferenceStateService {
  constructor(
    private preferenceRepo: ICollectionPreferenceItemRepository,
    private scoringService: ScoringService,
  ) {}

  async recalculatePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    const preferences = await this.scoringService.computePreferences(
      collectionId,
      curatorId,
    );

    // Batch fetch: get all existing preferences once, not per item
    const existing = await this.preferenceRepo.findByCollection(collectionId, curatorId);
    const existingByItemId = new Map(existing.map((p) => [p.itemId, p]));

    // Process all preferences in batches
    for (const pref of preferences) {
      const existingPref = existingByItemId.get(pref.itemId);
      if (existingPref) {
        await this.preferenceRepo.update(existingPref.id, {
          score: pref.score,
          confidence: pref.confidence,
          rankBucket: pref.rankBucket,
          comparisonCount: pref.comparisonCount,
          lastSeen: new Date(),
          updatedAt: new Date(),
        });
      } else {
        await this.preferenceRepo.create({
          collectionId,
          curatorId,
          itemId: pref.itemId,
          score: pref.score,
          confidence: pref.confidence,
          rankBucket: pref.rankBucket,
          comparisonCount: pref.comparisonCount,
        });
      }
    }

    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }

  async getItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }
}
