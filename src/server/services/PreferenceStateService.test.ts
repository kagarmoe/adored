import { describe, expect, it, vi } from "vitest";
import { PreferenceStateService } from "./PreferenceStateService";
import type { ScoringService } from "./ScoringService";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { CollectionPreferenceItem } from "@/types";

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

  const preferenceRepo = {
    findByCollection,
    create,
    update,
  } as unknown as ICollectionPreferenceItemRepository;

  const service = new PreferenceStateService(preferenceRepo, scoringService);
  return { service, computePreferences, findByCollection, create, update };
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
    );

    const result = await service.getItemPreferences(COLLECTION, CURATOR);

    expect(result).toBe(stored);
    expect(findByCollection).toHaveBeenCalledWith(COLLECTION, CURATOR);
  });
});
