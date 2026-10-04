import type { CollectionPreferenceItem } from "@/types";
import type { PreferenceStateService } from "@/server/services/PreferenceStateService";
import type { Database } from "@/lib/db";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { ScoringService } from "@/server/services/ScoringService";
import { PreferenceStateService as PreferenceStateServiceImpl } from "@/server/services/PreferenceStateService";

export class PreferenceController {
  constructor(
    private preferenceService: PreferenceStateService,
  ) {}

  static fromDb(db: Database): PreferenceController {
    // All repos share the SAME db/tx handle so the whole recompute stays inside
    // the caller's transaction (the decisions route wraps this in withTransaction).
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const sessionRepo = new SessionRepository(db);
    const decisionRepo = new DecisionEventRepository(db);
    const itemRepo = new ItemRepository(db);
    const scoringService = new ScoringService();
    const prefService = new PreferenceStateServiceImpl(
      prefRepo,
      scoringService,
      itemRepo,
      sessionRepo,
      decisionRepo,
    );
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
