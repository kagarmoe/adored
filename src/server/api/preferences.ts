import type { CollectionPreferenceItem } from "@/types";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { PreferenceStateService } from "@/server/services/PreferenceStateService";

export class PreferenceController {
  constructor(
    private preferenceRepo: ICollectionPreferenceItemRepository,
    private preferenceService: PreferenceStateService,
  ) {}

  async getPreferenceSummary(
    collectionId: string,
    curatorId: string,
  ): Promise<{ totalItems: number; averageScore: number; distribution: Record<string, number> }> {
    return this.preferenceService.getPreferenceSummary(collectionId, curatorId);
  }

  async listItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceService.getItemPreferences(collectionId, curatorId);
  }

  async getItemPreference(itemId: string, curatorId: string): Promise<CollectionPreferenceItem | null> {
    // TODO: Implement when preferenceRepo.findByItem available
    return null;
  }

  async recalculatePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceService.recalculatePreferences(collectionId, curatorId);
  }

  async clearPreferences(collectionId: string, curatorId: string): Promise<void> {
    return this.preferenceService.clearPreferences(collectionId, curatorId);
  }
}
