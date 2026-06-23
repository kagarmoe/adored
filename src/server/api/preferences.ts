import type { CollectionPreferenceItem } from "@/types";
import type { PreferenceStateService } from "@/server/services/PreferenceStateService";
import type { Database } from "@/lib/db";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { ScoringService } from "@/server/services/ScoringService";
import { PreferenceStateService as PreferenceStateServiceImpl } from "@/server/services/PreferenceStateService";

export class PreferenceController {
  constructor(
    private preferenceService: PreferenceStateService,
  ) {}

  static fromDb(db: Database): PreferenceController {
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const scoringService = new ScoringService(new DecisionEventRepository(db), new SessionRepository(db));
    const prefService = new PreferenceStateServiceImpl(prefRepo, scoringService);
    return new PreferenceController(prefService);
  }

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
