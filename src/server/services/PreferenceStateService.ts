import type { CollectionPreferenceItem, DecisionEvent } from "@/types";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ScoringService } from "@/server/services/ScoringService";
import {
  deriveOrder,
  RANKABLE_BUCKETS,
  toComparisonEvents,
  type ComparisonEvent,
  type RankItem,
} from "@/lib/insertion-ranking";

export class PreferenceStateService {
  constructor(
    private preferenceRepo: ICollectionPreferenceItemRepository,
    private scoringService: ScoringService,
    private itemRepo: IItemRepository,
    private sessionRepo: ISessionRepository,
    private decisionRepo: IDecisionEventRepository,
  ) {}

  async recalculatePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    // Read the curator's decision log ONCE and share it between bucket scoring
    // and the pairwise-comparison mapping — both consumers derive from the same
    // event set, so a single read is behavior-identical to the old double read.
    const events = await this.loadDecisionEvents(collectionId, curatorId);

    const preferences = await this.scoringService.computePreferences(
      collectionId,
      curatorId,
      events,
    );

    const orderRankByItem = await this.deriveOrderRanks(
      collectionId,
      preferences,
      events,
    );

    // TWO statements instead of ~2N: clear FIRST so every order_rank is NULL, then
    // upsert the whole recomputed set in ONE statement. Clearing first is REQUIRED —
    // the partial unique index on (collection, curator, order_rank) is checked per
    // row within the upsert (not deferred), so permuting ranks in place could
    // transiently collide; nulling all then assigning DISTINCT ranks avoids it.
    // (This replaced a per-row awaited loop — P round-trips per decision — that
    // could blow the function timeout and roll back the whole tap.)
    await this.preferenceRepo.clearOrderRanks(collectionId, curatorId);
    await this.preferenceRepo.bulkUpsert(
      preferences.map((pref) => ({
        collectionId,
        curatorId,
        itemId: pref.itemId,
        score: pref.score,
        confidence: pref.confidence,
        rankBucket: pref.rankBucket,
        comparisonCount: pref.comparisonCount,
        orderRank: orderRankByItem.get(pref.itemId) ?? null,
      })),
    );

    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }

  // Run the pure binary-insertion engine over the curator's pairwise comparisons
  // for the Love+Like items, mapping each placed item to its dense slot (0 = most
  // loved). Items the engine leaves unplaced are absent from the map (=> null).
  private async deriveOrderRanks(
    collectionId: string,
    preferences: CollectionPreferenceItem[],
    events: DecisionEvent[],
  ): Promise<Map<string, number>> {
    const rankableIds = new Set(
      preferences.filter((p) => RANKABLE_BUCKETS.has(p.rankBucket)).map((p) => p.itemId),
    );
    if (rankableIds.size === 0) return new Map();

    // One batched read of the collection's items; keep each rankable item's OWN
    // createdAt (drives the engine's deterministic canonical insertion sequence).
    const items = await this.itemRepo.findByCollection(collectionId);
    const rankItems: RankItem[] = items
      .filter((i) => rankableIds.has(i.id))
      .map((i) => ({ id: i.id, createdAt: i.createdAt }));

    // Shared mapping with the live selector (selectNextPair) — both entry points
    // build ComparisonEvent[] identically, so they ask the same next question.
    const comparisons: ComparisonEvent[] = toComparisonEvents(events);
    const { order } = deriveOrder(rankItems, comparisons);
    return new Map(order.map((id, i) => [id, i]));
  }

  // The curator's non-deleted sessions' decision events, fetched once and in
  // parallel (findByCollectionAndCurator yields the same session set the scorer
  // scopes to). Shared by bucket scoring and the pairwise mapping.
  private async loadDecisionEvents(
    collectionId: string,
    curatorId: string,
  ): Promise<DecisionEvent[]> {
    const sessions = await this.sessionRepo.findByCollectionAndCurator(collectionId, curatorId);
    const perSession = await Promise.all(
      sessions.map((s) => this.decisionRepo.findBySession(s.id)),
    );
    return perSession.flat();
  }

  async getItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }
}
