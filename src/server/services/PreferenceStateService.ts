import type { CollectionPreferenceItem, DecisionEvent } from "@/types";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ScoringService } from "@/server/services/ScoringService";
import {
  deriveOrder,
  toComparisonEvents,
  type ComparisonEvent,
  type RankItem,
} from "@/lib/insertion-ranking";

// Only Love + Like carry an insertion order — medium/low and any unplaced
// top/high stay orderRank = null.
const RANKABLE_BUCKETS = new Set<CollectionPreferenceItem["rankBucket"]>(["top", "high"]);

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
    const preferences = await this.scoringService.computePreferences(
      collectionId,
      curatorId,
    );

    const orderRankByItem = await this.deriveOrderRanks(
      collectionId,
      curatorId,
      preferences,
    );

    // Batch fetch: get all existing preferences once, not per item
    const existing = await this.preferenceRepo.findByCollection(collectionId, curatorId);
    const existingByItemId = new Map(existing.map((p) => [p.itemId, p]));

    // Clear FIRST so every order_rank is NULL before any new one is written —
    // avoids a transient collision on the (collection, curator, order_rank)
    // partial unique index while the per-row upserts assign distinct ranks.
    await this.preferenceRepo.clearOrderRanks(collectionId, curatorId);

    // Process all preferences in batches
    for (const pref of preferences) {
      const orderRank = orderRankByItem.get(pref.itemId) ?? null;
      const existingPref = existingByItemId.get(pref.itemId);
      if (existingPref) {
        await this.preferenceRepo.update(existingPref.id, {
          score: pref.score,
          confidence: pref.confidence,
          rankBucket: pref.rankBucket,
          comparisonCount: pref.comparisonCount,
          orderRank,
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
          orderRank,
        });
      }
    }

    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }

  // Run the pure binary-insertion engine over the curator's pairwise comparisons
  // for the Love+Like items, mapping each placed item to its dense slot (0 = most
  // loved). Items the engine leaves unplaced are absent from the map (=> null).
  private async deriveOrderRanks(
    collectionId: string,
    curatorId: string,
    preferences: CollectionPreferenceItem[],
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

    const comparisons = await this.loadPairwiseComparisons(collectionId, curatorId);
    const { order } = deriveOrder(rankItems, comparisons);
    return new Map(order.map((id, i) => [id, i]));
  }

  private async loadPairwiseComparisons(
    collectionId: string,
    curatorId: string,
  ): Promise<ComparisonEvent[]> {
    const sessions = await this.sessionRepo.findByCollectionAndCurator(collectionId, curatorId);
    const events: DecisionEvent[] = [];
    for (const session of sessions) {
      events.push(...(await this.decisionRepo.findBySession(session.id)));
    }
    // Shared mapping with the live selector (selectNextPair) — both entry points
    // build ComparisonEvent[] identically, so they ask the same next question.
    return toComparisonEvents(events);
  }

  async getItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }
}
