import { describe, expect, it, vi } from "vitest";
import { PreferenceStateService } from "./PreferenceStateService";
import type { ScoringService } from "./ScoringService";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { CollectionPreferenceItem, Item, Session } from "@/types";

// Rankable-order dependencies. Default stubs yield NO comparisons and NO items,
// so deriveOrder produces no order_rank — these unit tests assert the score/upsert
// bookkeeping; order_rank derivation is covered end-to-end in the DB integration
// test (binary-insertion-ranking.integration.test.ts).
function makeItemRepo(items: Item[] = []): IItemRepository {
  return { findByCollection: vi.fn().mockResolvedValue(items) } as unknown as IItemRepository;
}
function makeSessionRepo(sessions: Session[] = []): ISessionRepository {
  return {
    findByCollectionAndCurator: vi.fn().mockResolvedValue(sessions),
  } as unknown as ISessionRepository;
}
function makeDecisionRepo(): IDecisionEventRepository {
  return { findBySession: vi.fn().mockResolvedValue([]) } as unknown as IDecisionEventRepository;
}

const COLLECTION = "col-1";
const CURATOR = "cur-1";

// computePreferences returns CollectionPreferenceItem[]; the service only reads
// the scored fields (itemId/score/confidence/rankBucket/comparisonCount), so the
// fixtures below carry those plus enough shape to type-check cleanly.
function scored(
  overrides: Partial<CollectionPreferenceItem> & { itemId: string },
): CollectionPreferenceItem {
  return {
    id: `score-${overrides.itemId}`,
    collectionId: COLLECTION,
    curatorId: CURATOR,
    score: 0.625,
    confidence: 0.2,
    rankBucket: "high",
    comparisonCount: 1,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function persisted(
  overrides: Partial<CollectionPreferenceItem> & { id: string; itemId: string },
): CollectionPreferenceItem {
  return scored(overrides);
}

function buildService(parts: {
  computed: CollectionPreferenceItem[];
  existing: CollectionPreferenceItem[];
  final: CollectionPreferenceItem[];
}) {
  const computePreferences = vi.fn().mockResolvedValue(parts.computed);
  const scoringService = { computePreferences } as unknown as ScoringService;

  const findByCollection = vi
    .fn<ICollectionPreferenceItemRepository["findByCollection"]>()
    .mockResolvedValueOnce(parts.existing) // existing read inside recalculate
    .mockResolvedValueOnce(parts.final); // final read that is returned
  const create = vi
    .fn<ICollectionPreferenceItemRepository["create"]>()
    .mockImplementation(async () => persisted({ id: "created", itemId: "x" }));
  const update = vi
    .fn<ICollectionPreferenceItemRepository["update"]>()
    .mockImplementation(async () => persisted({ id: "updated", itemId: "x" }));
  const clearOrderRanks = vi
    .fn<ICollectionPreferenceItemRepository["clearOrderRanks"]>()
    .mockResolvedValue(undefined);

  const preferenceRepo = {
    findByCollection,
    create,
    update,
    clearOrderRanks,
  } as unknown as ICollectionPreferenceItemRepository;

  const service = new PreferenceStateService(
    preferenceRepo,
    scoringService,
    makeItemRepo(),
    makeSessionRepo(),
    makeDecisionRepo(),
  );
  return { service, computePreferences, findByCollection, create, update, clearOrderRanks };
}

describe("PreferenceStateService.recalculatePreferences", () => {
  it("creates a row for a newly-scored item", async () => {
    const computed = [
      scored({
        itemId: "a",
        score: 0.875,
        confidence: 0.4,
        rankBucket: "top",
        comparisonCount: 3,
      }),
    ];
    const { service, create, update } = buildService({
      computed,
      existing: [], // nothing persisted yet for this item
      final: [persisted({ id: "pref-a", itemId: "a", rankBucket: "top" })],
    });

    await service.recalculatePreferences(COLLECTION, CURATOR);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      collectionId: COLLECTION,
      curatorId: CURATOR,
      itemId: "a",
      score: 0.875,
      confidence: 0.4,
      rankBucket: "top",
      comparisonCount: 3,
      // No comparisons/items supplied to the stubs, so the engine places nothing.
      orderRank: null,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates the existing row instead of creating", async () => {
    const computed = [
      scored({
        itemId: "a",
        score: 0.875,
        confidence: 0.4,
        rankBucket: "top",
        comparisonCount: 3,
      }),
    ];
    const { service, create, update } = buildService({
      computed,
      existing: [persisted({ id: "pref-a", itemId: "a" })],
      final: [persisted({ id: "pref-a", itemId: "a", rankBucket: "top" })],
    });

    await service.recalculatePreferences(COLLECTION, CURATOR);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      "pref-a",
      expect.objectContaining({
        score: 0.875,
        confidence: 0.4,
        rankBucket: "top",
        comparisonCount: 3,
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("clears order_ranks before upserting, and assigns dense ranks from the engine", async () => {
    // Two top items, one pairwise (B more loved than A) => B gets orderRank 0, A gets 1.
    const t0 = new Date("2026-06-01T00:00:00Z");
    const t1 = new Date("2026-06-01T00:00:01Z");
    const computed = [
      scored({ itemId: "a", score: 0.875, rankBucket: "top", comparisonCount: 2 }),
      scored({ itemId: "b", score: 0.875, rankBucket: "top", comparisonCount: 2 }),
    ];
    const computePreferences = vi.fn().mockResolvedValue(computed);
    const scoringService = { computePreferences } as unknown as ScoringService;

    const captured: Array<{ itemId: string; orderRank: number | null }> = [];
    const create = vi
      .fn<ICollectionPreferenceItemRepository["create"]>()
      .mockImplementation(async (data) => {
        captured.push({ itemId: data.itemId, orderRank: data.orderRank ?? null });
        return persisted({ id: `pref-${data.itemId}`, itemId: data.itemId });
      });
    const clearOrderRanks = vi
      .fn<ICollectionPreferenceItemRepository["clearOrderRanks"]>()
      .mockResolvedValue(undefined);
    const preferenceRepo = {
      findByCollection: vi.fn().mockResolvedValue([]),
      create,
      update: vi.fn(),
      clearOrderRanks,
    } as unknown as ICollectionPreferenceItemRepository;

    const items: Item[] = [
      { id: "a", createdAt: t0 } as Item,
      { id: "b", createdAt: t1 } as Item,
    ];
    const sessions: Session[] = [{ id: "sess-1" } as Session];
    const decisionRepo = {
      findBySession: vi.fn().mockResolvedValue([
        {
          id: "evt-1",
          sessionId: "sess-1",
          type: "pairwise_compare",
          decision: { itemAId: "a", itemBId: "b", result: "item_b" },
          createdAt: t1,
        },
      ]),
    } as unknown as IDecisionEventRepository;

    const service = new PreferenceStateService(
      preferenceRepo,
      scoringService,
      makeItemRepo(items),
      makeSessionRepo(sessions),
      decisionRepo,
    );

    await service.recalculatePreferences(COLLECTION, CURATOR);

    expect(clearOrderRanks).toHaveBeenCalledWith(COLLECTION, CURATOR);
    const rankOf = (id: string) => captured.find((c) => c.itemId === id)!.orderRank;
    expect(rankOf("b")).toBe(0);
    expect(rankOf("a")).toBe(1);
  });

  it("returns the freshly-read preferences after persisting", async () => {
    const final = [
      persisted({
        id: "pref-a",
        itemId: "a",
        score: 0.875,
        rankBucket: "top",
      }),
    ];
    const { service } = buildService({
      computed: [scored({ itemId: "a", rankBucket: "top" })],
      existing: [],
      final,
    });

    const result = await service.recalculatePreferences(COLLECTION, CURATOR);

    expect(result).toBe(final);
  });
});

describe("PreferenceStateService.getItemPreferences", () => {
  it("getItemPreferences passes through to the repo", async () => {
    const stored = [persisted({ id: "pref-a", itemId: "a", rankBucket: "top" })];
    const findByCollection = vi
      .fn<ICollectionPreferenceItemRepository["findByCollection"]>()
      .mockResolvedValue(stored);
    const preferenceRepo = {
      findByCollection,
    } as unknown as ICollectionPreferenceItemRepository;
    const service = new PreferenceStateService(
      preferenceRepo,
      {} as unknown as ScoringService,
      makeItemRepo(),
      makeSessionRepo(),
      makeDecisionRepo(),
    );

    const result = await service.getItemPreferences(COLLECTION, CURATOR);

    expect(result).toBe(stored);
    expect(findByCollection).toHaveBeenCalledWith(COLLECTION, CURATOR);
  });
});
