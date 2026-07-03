import { describe, expect, it, vi } from "vitest";
import { PreferenceStateService } from "./PreferenceStateService";
import type { ScoringService } from "./ScoringService";
import type { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import type { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import type { CollectionPreferenceItem, Item, Session } from "@/types";

// Rankable-order dependencies. Default stubs yield NO comparisons and NO items,
// so deriveOrder produces no order_rank — these unit tests assert the score/upsert
// bookkeeping; order_rank derivation is covered end-to-end in the DB integration
// test (binary-insertion-ranking.integration.test.ts).
function makeItemRepo(items: Item[] = []): ItemRepository {
  return { findByCollection: vi.fn().mockResolvedValue(items) } as unknown as ItemRepository;
}
function makeSessionRepo(sessions: Session[] = []): SessionRepository {
  return {
    findByCollectionAndCurator: vi.fn().mockResolvedValue(sessions),
  } as unknown as SessionRepository;
}
function makeDecisionRepo(): DecisionEventRepository {
  return { findBySession: vi.fn().mockResolvedValue([]) } as unknown as DecisionEventRepository;
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

type BulkUpsertRow = Parameters<CollectionPreferenceItemRepository["bulkUpsert"]>[0][number];

function buildService(parts: {
  computed: CollectionPreferenceItem[];
  final: CollectionPreferenceItem[];
}) {
  const computePreferences = vi.fn().mockResolvedValue(parts.computed);
  const scoringService = { computePreferences } as unknown as ScoringService;

  // The service now reads preferences ONCE (the final read it returns) — the old
  // per-item "existing" read is gone; the bulk upsert insert-or-updates by the
  // (item_id, curator_id) unique index without needing to know prior ids.
  const findByCollection = vi
    .fn<CollectionPreferenceItemRepository["findByCollection"]>()
    .mockResolvedValue(parts.final);
  const bulkUpsert = vi
    .fn<CollectionPreferenceItemRepository["bulkUpsert"]>()
    .mockResolvedValue(undefined);
  const clearOrderRanks = vi
    .fn<CollectionPreferenceItemRepository["clearOrderRanks"]>()
    .mockResolvedValue(undefined);

  const preferenceRepo = {
    findByCollection,
    bulkUpsert,
    clearOrderRanks,
  } as unknown as CollectionPreferenceItemRepository;

  const service = new PreferenceStateService(
    preferenceRepo,
    scoringService,
    makeItemRepo(),
    makeSessionRepo(),
    makeDecisionRepo(),
  );
  return { service, computePreferences, findByCollection, bulkUpsert, clearOrderRanks };
}

describe("PreferenceStateService.recalculatePreferences", () => {
  it("bulk-upserts the whole scored set in ONE call (no per-row loop)", async () => {
    const computed = [
      scored({
        itemId: "a",
        score: 0.875,
        confidence: 0.4,
        rankBucket: "top",
        comparisonCount: 3,
      }),
    ];
    const { service, bulkUpsert, clearOrderRanks } = buildService({
      computed,
      final: [persisted({ id: "pref-a", itemId: "a", rankBucket: "top" })],
    });

    await service.recalculatePreferences(COLLECTION, CURATOR);

    // Two statements total: clear-ranks then ONE bulk upsert.
    expect(clearOrderRanks).toHaveBeenCalledTimes(1);
    expect(bulkUpsert).toHaveBeenCalledTimes(1);
    const rows = bulkUpsert.mock.calls[0][0];
    expect(rows).toEqual([
      {
        collectionId: COLLECTION,
        curatorId: CURATOR,
        itemId: "a",
        score: 0.875,
        confidence: 0.4,
        rankBucket: "top",
        comparisonCount: 3,
        // No comparisons/items supplied to the stubs, so the engine places nothing.
        orderRank: null,
      },
    ]);
  });

  it("clears order_ranks BEFORE the bulk upsert (the transient-collision guard)", async () => {
    const callOrder: string[] = [];
    const computed = [scored({ itemId: "a", rankBucket: "top" })];
    const { service, bulkUpsert, clearOrderRanks } = buildService({
      computed,
      final: [persisted({ id: "pref-a", itemId: "a", rankBucket: "top" })],
    });
    clearOrderRanks.mockImplementation(async () => { callOrder.push("clear"); });
    bulkUpsert.mockImplementation(async () => { callOrder.push("upsert"); });

    await service.recalculatePreferences(COLLECTION, CURATOR);

    expect(callOrder).toEqual(["clear", "upsert"]);
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

    let captured: BulkUpsertRow[] = [];
    const bulkUpsert = vi
      .fn<CollectionPreferenceItemRepository["bulkUpsert"]>()
      .mockImplementation(async (rows) => { captured = rows; });
    const clearOrderRanks = vi
      .fn<CollectionPreferenceItemRepository["clearOrderRanks"]>()
      .mockResolvedValue(undefined);
    const preferenceRepo = {
      findByCollection: vi.fn().mockResolvedValue([]),
      bulkUpsert,
      clearOrderRanks,
    } as unknown as CollectionPreferenceItemRepository;

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
    } as unknown as DecisionEventRepository;

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
    // Every ranked slot is distinct + dense — the invariant the bulk SQL protects.
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
      .fn<CollectionPreferenceItemRepository["findByCollection"]>()
      .mockResolvedValue(stored);
    const preferenceRepo = {
      findByCollection,
    } as unknown as CollectionPreferenceItemRepository;
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
