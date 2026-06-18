import type { CollectionPreferenceItem } from "@/types";
import type { PreferenceStateService } from "@/server/services/PreferenceStateService";

export class PreferenceController {
  constructor(
    private preferenceService: PreferenceStateService,
  ) {}

  async listItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceService.getItemPreferences(collectionId, curatorId);
  }

  async getItemPreference(): Promise<CollectionPreferenceItem | null> {
    // TODO: Implement when preferenceRepo.findByItem available
    return null;
  }

  async recalculatePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceService.recalculatePreferences(collectionId, curatorId);
  }
}
