import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeTxDb } from "@/test-support/fakeTxDb";

// Materialization writes happen on tx-bound repos the service constructs itself
// (`new SortResultRepository(tx)`), so the unit test can't observe them via the
// injected repos. Mock the tx-bound repo constructors (mirroring the route
// tests) to observe the in-transaction writes; the AUTHORITATIVE atomicity proof
// is the un-mocked integration rollback test in sort-pipeline.integration.test.ts.
const { txResultRepo, txItemRepo, isResultNumberConflict } = vi.hoisted(() => ({
  txResultRepo: { getNextResultNumber: vi.fn(), insertWithNumber: vi.fn(), delete: vi.fn() },
  txItemRepo: { create: vi.fn(), deleteByResult: vi.fn() },
  isResultNumberConflict: vi.fn(function () { return false; }),
}));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(function () { return txResultRepo; }),
  isResultNumberConflict,
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(function () { return txItemRepo; }),
}));

import {
  SortResultService,
  SupersedeStateError,
  DeleteResultStateError,
  ResultNumberExhaustedError,
} from "./SortResultService";
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
import type { Database } from "@/lib/db";

const txDb = fakeTxDb() as unknown as Database;

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

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks wipes the hoisted predicate's implementation too; restore the
  // default (no conflict) so only the exhaustion test opts into retries.
  isResultNumberConflict.mockReturnValue(false);
  txResultRepo.getNextResultNumber.mockResolvedValue(1);
  txResultRepo.insertWithNumber.mockResolvedValue(sortResult());
  txResultRepo.delete.mockResolvedValue(undefined);
  txItemRepo.create.mockResolvedValue(sortResultItem());
  txItemRepo.deleteByResult.mockResolvedValue(undefined);
});

describe("SortResultService.createDraftResult", () => {
  // The score-desc/rank/bucket mapping is owned by rankPreferencesToItems
  // (sortResultMaterialization.test.ts) and the un-mocked materialization by the
  // integration suite. Here we prove the wiring: the pure ranking output flows
  // into the transactional primitive's tx-bound writes.
  it("ranks preferences (score desc) and inserts one tx item per preference", async () => {
    const created = sortResult();
    txResultRepo.insertWithNumber.mockResolvedValue(created);
    // Deliberately out of order to prove the service sorts by score desc.
    const preferenceRepo = {
      findByCollection: async () => [
        preference({ itemId: "b", score: 0.4, rankBucket: "medium" }),
        preference({ itemId: "a", score: 0.9, rankBucket: "top" }),
      ],
    } as unknown as ICollectionPreferenceItemRepository;

    // findDrafts returns ONLY the just-created draft, so the supersede reap
    // (purses-p2rj) finds no PRIOR draft and deletes nothing.
    const findDrafts = vi.fn(async () => [created]);
    const result = await new SortResultService(
      { findDrafts } as unknown as ISortResultRepository,
      {} as unknown as ISortResultItemRepository,
      preferenceRepo,
      txDb,
    ).createDraftResult(COLLECTION, CURATOR, "Spring sort");

    expect(result).toBe(created);
    // The reap ran but had no prior draft to delete (the only draft is the new one).
    expect(findDrafts).toHaveBeenCalledWith(COLLECTION, CURATOR);
    expect(txResultRepo.delete).not.toHaveBeenCalled();
    expect(txResultRepo.insertWithNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: COLLECTION,
        curatorId: CURATOR,
        name: "Spring sort",
        status: "draft",
        number: 1,
      }),
    );
    expect(txItemRepo.create).toHaveBeenCalledTimes(2);
    expect(txItemRepo.create).toHaveBeenNthCalledWith(1, {
      sortResultId: created.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
    });
    expect(txItemRepo.create).toHaveBeenNthCalledWith(2, {
      sortResultId: created.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "medium",
    });
  });

  it("throws ResultNumberExhaustedError when the number race loses all 5 attempts", async () => {
    // Real-shaped conflict the production predicate matches (code 23505 +
    // the unique-index name); the test predicate returns true for it.
    const conflict = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "sort_results_collection_number_unique"',
      ),
      { code: "23505" },
    );
    isResultNumberConflict.mockReturnValue(true);
    txResultRepo.insertWithNumber.mockRejectedValue(conflict);
    const preferenceRepo = {
      findByCollection: async () => [],
    } as unknown as ICollectionPreferenceItemRepository;

    await expect(
      new SortResultService(
        {} as unknown as ISortResultRepository,
        {} as unknown as ISortResultItemRepository,
        preferenceRepo,
        txDb,
      ).createDraftResult(COLLECTION, CURATOR, "Spring sort"),
    ).rejects.toBeInstanceOf(ResultNumberExhaustedError);
    // 5 attempts: each opens a tx and tries the allocation insert once.
    expect(txResultRepo.insertWithNumber).toHaveBeenCalledTimes(5);
  });

  it("createDraftResult with no preferences creates a result but zero items", async () => {
    const created = sortResult();
    txResultRepo.insertWithNumber.mockResolvedValue(created);
    const preferenceRepo = {
      findByCollection: async () => [],
    } as unknown as ICollectionPreferenceItemRepository;

    const result = await new SortResultService(
      { findDrafts: async () => [created] } as unknown as ISortResultRepository,
      {} as unknown as ISortResultItemRepository,
      preferenceRepo,
      txDb,
    ).createDraftResult(COLLECTION, CURATOR, "Empty sort");

    expect(result).toBe(created);
    expect(txItemRepo.create).not.toHaveBeenCalled();
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
      txDb,
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
  it("clones a finalized source's items into a new '(Revision)' draft via the tx primitive", async () => {
    const oldResult = sortResult({ id: "res-1", name: "Spring sort", status: "finalized" });
    const newResult = sortResult({ id: "res-2", name: "Spring sort (Revision)" });
    txResultRepo.insertWithNumber.mockResolvedValue(newResult);
    const oldItems = [
      sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top" }),
      sortResultItem({ itemId: "b", computedRank: 1, computedBucket: "low" }),
    ];
    // findById + findByResult are pre-tx reads on the INJECTED repos.
    const sortResultRepo = {
      findById: async () => oldResult,
    } as unknown as ISortResultRepository;
    const sortResultItemRepo = {
      findByResult: async () => oldItems,
    } as unknown as ISortResultItemRepository;

    const result = await new SortResultService(
      sortResultRepo,
      sortResultItemRepo,
      {} as unknown as ICollectionPreferenceItemRepository,
      txDb,
    ).supersedeResult("res-1");

    expect(result).toBe(newResult);
    // The tx primitive inserts the revision result + the cloned computed items.
    expect(txResultRepo.insertWithNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: oldResult.collectionId,
        curatorId: oldResult.curatorId,
        name: "Spring sort (Revision)",
        status: "draft",
      }),
    );
    expect(txItemRepo.create).toHaveBeenNthCalledWith(1, {
      sortResultId: newResult.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
    });
    expect(txItemRepo.create).toHaveBeenNthCalledWith(2, {
      sortResultId: newResult.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "low",
    });
  });

  it("guard: returns null when the source is absent (never opens a tx)", async () => {
    const sortResultRepo = {
      findById: async () => null,
    } as unknown as ISortResultRepository;

    const result = await new SortResultService(
      sortResultRepo,
      {} as unknown as ISortResultItemRepository,
      {} as unknown as ICollectionPreferenceItemRepository,
      txDb,
    ).supersedeResult("missing");

    expect(result).toBeNull();
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });

  it("guard: throws SupersedeStateError when the source is not finalized (never opens a tx)", async () => {
    const sortResultRepo = {
      findById: async () => sortResult({ status: "draft" }),
    } as unknown as ISortResultRepository;

    await expect(
      new SortResultService(
        sortResultRepo,
        {} as unknown as ISortResultItemRepository,
        {} as unknown as ICollectionPreferenceItemRepository,
        txDb,
      ).supersedeResult("res-1"),
    ).rejects.toBeInstanceOf(SupersedeStateError);
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });
});

describe("SortResultService deleteResult", () => {
  // The status guard reads findById from the INJECTED sortResultRepo and
  // returns/throws BEFORE opening the tx; the deletes run on the tx-bound repos
  // (txItemRepo.deleteByResult / txResultRepo.delete). The un-mocked atomicity
  // proof lives in sort-pipeline.integration.test.ts.
  it("returns false when the result is absent (no tx deletes attempted)", async () => {
    const sortResultRepo = {
      findById: async () => null,
    } as unknown as ISortResultRepository;

    const deleted = await new SortResultService(
      sortResultRepo,
      {} as unknown as ISortResultItemRepository,
      {} as unknown as ICollectionPreferenceItemRepository,
      txDb,
    ).deleteResult("missing");

    expect(deleted).toBe(false);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
    expect(txResultRepo.delete).not.toHaveBeenCalled();
  });

  it("throws DeleteResultStateError when the result is finalized (no tx deletes attempted)", async () => {
    const sortResultRepo = {
      findById: async () => sortResult({ status: "finalized" }),
    } as unknown as ISortResultRepository;

    await expect(
      new SortResultService(
        sortResultRepo,
        {} as unknown as ISortResultItemRepository,
        {} as unknown as ICollectionPreferenceItemRepository,
        txDb,
      ).deleteResult("res-1"),
    ).rejects.toBeInstanceOf(DeleteResultStateError);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
    expect(txResultRepo.delete).not.toHaveBeenCalled();
  });

  it("deletes children BEFORE the result row (FK-safe order) inside one tx for a draft", async () => {
    const calls: string[] = [];
    txItemRepo.deleteByResult.mockImplementation(async () => {
      calls.push("children");
    });
    txResultRepo.delete.mockImplementation(async () => {
      calls.push("result");
    });
    const sortResultRepo = {
      findById: async () => sortResult({ status: "draft" }),
    } as unknown as ISortResultRepository;

    const deleted = await new SortResultService(
      sortResultRepo,
      {} as unknown as ISortResultItemRepository,
      {} as unknown as ICollectionPreferenceItemRepository,
      txDb,
    ).deleteResult("res-1");

    expect(deleted).toBe(true);
    // Writes land on the tx-bound repos, not the injected ones.
    expect(txItemRepo.deleteByResult).toHaveBeenCalledWith("res-1");
    expect(txResultRepo.delete).toHaveBeenCalledWith("res-1");
    // Children-first: the sort_result_items -> sort_results FK has no cascade.
    expect(calls).toEqual(["children", "result"]);
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
      txDb,
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
      txDb,
    ).resetManualOverride("item-a");

    expect(resetUpdate).toHaveBeenCalledWith(
      "item-a",
      expect.objectContaining({ manualRank: null, manualBucket: null }),
    );
  });
});
