import type { CollectionPreferenceItem, DecisionEvent, Item } from "@/types";
import type { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import type { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import type { ScoringService } from "@/server/services/ScoringService";
import { loadCuratorDecisionEvents } from "@/server/services/decision-log";
import {
  deriveOrder,
  toComparisonEvents,
  type ComparisonEvent,
  type RankItem,
} from "@/lib/insertion-ranking";
import { selectComparableItems } from "@/lib/compare-selection";

export class PreferenceStateService {
  constructor(
    private preferenceRepo: CollectionPreferenceItemRepository,
    private scoringService: ScoringService,
    private itemRepo: ItemRepository,
    private sessionRepo: SessionRepository,
    private decisionRepo: DecisionEventRepository,
  ) {}

  async recalculatePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    // Read the curator's decision log ONCE and share it between bucket scoring
    // and the pairwise-comparison mapping — both consumers derive from the same
    // event set, so a single read is behavior-identical to the old double read.
    const events = await this.loadDecisionEvents(collectionId, curatorId);

    // purses-5g1g: load the collection's LIVE items ONCE (findByCollection
    // excludes soft-deleted rows and a purged item is gone entirely). This set
    // gates the derived preference set so a purged item — whose append-only
    // decision_events survive — can never be resurrected into a preference row
    // (an FK violation on preferences.item_id that would roll back the tap). The
    // same list feeds deriveOrderRanks, so it is read only once.
    const items = await this.itemRepo.findByCollection(collectionId);
    const liveItemIds = new Set(items.map((i) => i.id));

    const preferences = await this.scoringService.computePreferences(
      collectionId,
      curatorId,
      liveItemIds,
      events,
    );

    const orderRankByItem = this.deriveOrderRanks(items, preferences, events);

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
  // for comparable live items, mapping each placed item to its dense slot (0 =
  // most loved). Items the engine leaves unplaced are absent from the map (=> null).
  // `items` is the collection's LIVE item set, already loaded by the caller (the
  // preference set is already filtered to it), so no second read is needed.
  private deriveOrderRanks(
    items: Item[],
    preferences: CollectionPreferenceItem[],
    events: DecisionEvent[],
  ): Map<string, number> {
    if (preferences.length === 0) return new Map();

    // Keep each comparable item's OWN createdAt (drives the engine's deterministic
    // canonical insertion sequence).
    const rankItems: RankItem[] = selectComparableItems(items, new Map())
      .map((i) => ({ id: i.id, createdAt: i.createdAt }));

    // Shared mapping with the live selector (selectNextPair) — both entry points
    // build ComparisonEvent[] identically, so they ask the same next question.
    const comparisons: ComparisonEvent[] = toComparisonEvents(events);
    const { order } = deriveOrder(rankItems, comparisons);
    return new Map(order.map((id, i) => [id, i]));
  }

  // ONE definition of "the curator's decision log" (spec §2.6): delegates to the
  // shared helper so the recompute and the round page (DecisionController
  // .listForCurator) provably read the same event set. Shared by bucket scoring
  // and the pairwise mapping.
  private async loadDecisionEvents(
    collectionId: string,
    curatorId: string,
  ): Promise<DecisionEvent[]> {
    return loadCuratorDecisionEvents(this.sessionRepo, this.decisionRepo, collectionId, curatorId);
  }

  async getItemPreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    return this.preferenceRepo.findByCollection(collectionId, curatorId);
  }

  async getItemPreference(
    itemId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem | null> {
    return this.preferenceRepo.findByItem(itemId, curatorId);
  }
}
