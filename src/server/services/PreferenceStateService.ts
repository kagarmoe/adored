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

    for (const pref of preferences) {
      const existing = await this.preferenceRepo.findByItem(
        pref.itemId,
        curatorId,
      );
      if (existing) {
        await this.preferenceRepo.update(existing.id, {
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

  async clearPreferences(collectionId: string, curatorId: string): Promise<void> {
    await this.preferenceRepo.clear(collectionId, curatorId);
  }

  async getPreferenceSummary(
    collectionId: string,
    curatorId: string,
  ): Promise<{ totalItems: number; averageScore: number; distribution: Record<string, number> }> {
    const prefs = await this.preferenceRepo.findByCollection(collectionId, curatorId);

    const distribution = {
      top: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let totalScore = 0;

    for (const pref of prefs) {
      totalScore += pref.score;
      distribution[pref.rankBucket]++;
    }

    return {
      totalItems: prefs.length,
      averageScore: prefs.length > 0 ? totalScore / prefs.length : 0,
      distribution,
    };
  }

  async getItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }
}
