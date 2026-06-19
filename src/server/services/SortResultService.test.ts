import { describe, expect, it, vi } from "vitest";
import { SortResultService } from "./SortResultService";
import type {
  CollectionPreferenceItem,
  SortResult,
  SortResultItem,
} from "@/types";
import type {
  ISortResultRepository,
  ISortResultItemRepository,
} from "@/server/repositories/SortResultRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";

const COLLECTION = "col-1";
const CURATOR = "cur-1";

function sortResult(overrides: Partial<SortResult> = {}): SortResult {
  return {
    id: "res-1",
    collectionId: COLLECTION,
    curatorId: CURATOR,
    number: 1,
    status: "draft",
    name: "Spring sort",
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: null,
    ...overrides,
  };
}

function preference(
  overrides: Partial<CollectionPreferenceItem> = {},
): CollectionPreferenceItem {
  return {
    id: `pref-${overrides.itemId ?? "x"}`,
    collectionId: COLLECTION,
    curatorId: CURATOR,
    itemId: "x",
    score: 0.5,
    confidence: 0.5,
    rankBucket: "medium",
    comparisonCount: 1,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function sortResultItem(
  overrides: Partial<SortResultItem> = {},
): SortResultItem {
  return {
    id: `item-${overrides.itemId ?? "x"}`,
    sortResultId: "res-1",
    itemId: "x",
    computedRank: 0,
    computedBucket: "medium",
    manualRank: null,
    manualBucket: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SortResultService.createDraftResult", () => {
  it("createDraftResult materializes one ranked item per preference, sorted by score desc", async () => {
    const created = sortResult();
    const itemCreate = vi.fn(async () => sortResultItem());
    const sortResultRepo = {
      create: async () => created,
    } as unknown as ISortResultRepository;
    const sortResultItemRepo = {
      create: itemCreate,
    } as unknown as ISortResultItemRepository;
    // Deliberately out of order to prove the service sorts by score desc.
    const preferenceRepo = {
      findByCollection: async () => [
        preference({ itemId: "b", score: 0.4, rankBucket: "medium" }),
        preference({ itemId: "a", score: 0.9, rankBucket: "top" }),
      ],
    } as unknown as ICollectionPreferenceItemRepository;

    await new SortResultService(
      sortResultRepo,
      sortResultItemRepo,
      preferenceRepo,
    ).createDraftResult(COLLECTION, CURATOR, "Spring sort");

    expect(itemCreate).toHaveBeenCalledTimes(2);
    expect(itemCreate).toHaveBeenNthCalledWith(1, {
      sortResultId: created.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
    });
    expect(itemCreate).toHaveBeenNthCalledWith(2, {
      sortResultId: created.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "medium",
    });
  });

  it("createDraftResult with no preferences creates a result but zero items", async () => {
    const created = sortResult();
    const itemCreate = vi.fn();
    const sortResultRepo = {
      create: async () => created,
    } as unknown as ISortResultRepository;
    const sortResultItemRepo = {
      create: itemCreate,
    } as unknown as ISortResultItemRepository;
    const preferenceRepo = {
      findByCollection: async () => [],
    } as unknown as ICollectionPreferenceItemRepository;

    const result = await new SortResultService(
      sortResultRepo,
      sortResultItemRepo,
      preferenceRepo,
    ).createDraftResult(COLLECTION, CURATOR, "Empty sort");

    expect(result).toBe(created);
    expect(itemCreate).not.toHaveBeenCalled();
  });
});

describe("SortResultService.finalizeResult", () => {
  it("finalizeResult sets status finalized + finalizedAt", async () => {
    const update = vi.fn(async () => sortResult({ status: "finalized" }));
    const sortResultRepo = { update } as unknown as ISortResultRepository;

    await new SortResultService(
      sortResultRepo,
      {} as unknown as ISortResultItemRepository,
      {} as unknown as ICollectionPreferenceItemRepository,
    ).finalizeResult("res-1");

    expect(update).toHaveBeenCalledWith(
      "res-1",
      expect.objectContaining({
        status: "finalized",
        finalizedAt: expect.any(Date),
      }),
    );
  });
});

describe("SortResultService.supersedeResult", () => {
  it("supersedeResult clones computed items into a new draft named '(Revision)'", async () => {
    const oldResult = sortResult({ id: "res-1", name: "Spring sort" });
    const newResult = sortResult({ id: "res-2", name: "Spring sort (Revision)" });
    const oldItems = [
      sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top" }),
      sortResultItem({ itemId: "b", computedRank: 1, computedBucket: "low" }),
    ];

    const resultCreate = vi.fn(async () => newResult);
    const itemCreate = vi.fn(async () => sortResultItem());
    const sortResultRepo = {
      findById: async () => oldResult,
      create: resultCreate,
    } as unknown as ISortResultRepository;
    const sortResultItemRepo = {
      findByResult: async () => oldItems,
      create: itemCreate,
    } as unknown as ISortResultItemRepository;

    const result = await new SortResultService(
      sortResultRepo,
      sortResultItemRepo,
      {} as unknown as ICollectionPreferenceItemRepository,
    ).supersedeResult("res-1");

    expect(resultCreate).toHaveBeenCalledWith({
      collectionId: oldResult.collectionId,
      curatorId: oldResult.curatorId,
      name: "Spring sort (Revision)",
      status: "draft",
    });
    expect(itemCreate).toHaveBeenNthCalledWith(1, {
      sortResultId: newResult.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
    });
    expect(itemCreate).toHaveBeenNthCalledWith(2, {
      sortResultId: newResult.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "low",
    });
    expect(result).toBe(newResult);
  });

  it("supersedeResult returns null when the source is absent", async () => {
    const create = vi.fn();
    const sortResultRepo = {
      findById: async () => null,
      create,
    } as unknown as ISortResultRepository;

    const result = await new SortResultService(
      sortResultRepo,
      {} as unknown as ISortResultItemRepository,
      {} as unknown as ICollectionPreferenceItemRepository,
    ).supersedeResult("missing");

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("SortResultService manual override", () => {
  it("setManualOverride / resetManualOverride write manual fields", async () => {
    const setUpdate = vi.fn(async () =>
      sortResultItem({ manualRank: 3, manualBucket: "top" }),
    );
    const setRepo = {
      update: setUpdate,
    } as unknown as ISortResultItemRepository;

    await new SortResultService(
      {} as unknown as ISortResultRepository,
      setRepo,
      {} as unknown as ICollectionPreferenceItemRepository,
    ).setManualOverride("item-a", 3, "top");

    expect(setUpdate).toHaveBeenCalledWith(
      "item-a",
      expect.objectContaining({ manualRank: 3, manualBucket: "top" }),
    );

    const resetUpdate = vi.fn(async () => sortResultItem());
    const resetRepo = {
      update: resetUpdate,
    } as unknown as ISortResultItemRepository;

    await new SortResultService(
      {} as unknown as ISortResultRepository,
      resetRepo,
      {} as unknown as ICollectionPreferenceItemRepository,
    ).resetManualOverride("item-a");

    expect(resetUpdate).toHaveBeenCalledWith(
      "item-a",
      expect.objectContaining({ manualRank: null, manualBucket: null }),
    );
  });
});
