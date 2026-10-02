import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeTxDb } from "@/test-support/fakeTxDb";

// Materialization writes happen on tx-bound repos the service constructs itself
// (`new SortResultRepository(tx)`), so the unit test can't observe them via the
// injected repos. Mock the tx-bound repo constructors (mirroring the route
// tests) to observe the in-transaction writes; the AUTHORITATIVE atomicity proof
// is the un-mocked integration rollback test in sort-pipeline.integration.test.ts.
const { txResultRepo, txItemRepo, txSessionRepo, isResultNumberConflict } = vi.hoisted(() => ({
  txResultRepo: {
    getNextResultNumber: vi.fn(),
    insertWithNumber: vi.fn(),
    delete: vi.fn(),
    findByIdForUpdate: vi.fn(),
    update: vi.fn(),
    findDrafts: vi.fn(),
  },
  txItemRepo: { create: vi.fn(), deleteByResult: vi.fn(), findByResult: vi.fn(), update: vi.fn() },
  // finalizeResult resolves the curator's open session via a tx-bound
  // SessionRepository — mocked the same way as the other tx-bound repos above.
  txSessionRepo: { findInProgress: vi.fn(), update: vi.fn() },
  isResultNumberConflict: vi.fn(function () { return false; }),
}));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(function () { return txResultRepo; }),
  isResultNumberConflict,
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(function () { return txItemRepo; }),
}));
const { txPrefRepo } = vi.hoisted(() => ({ txPrefRepo: { findByItem: vi.fn() } }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({
  CollectionPreferenceItemRepository: vi.fn(function () { return txPrefRepo; }),
}));
// Every draft writer takes the (collection, curator) advisory lock; the fake tx
// can't execute SQL, so stub only the lock (the DB tier proves it for real).
vi.mock("@/lib/transactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transactions")>()),
  lockCollectionCurator: vi.fn(),
}));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({
  SessionRepository: vi.fn(function () { return txSessionRepo; }),
}));
// Epic S: the service reads the curator's decision log to snapshot usage at
// materialization. This unit test isolates the tx wiring, so stub the log empty
// → every item is stamped usage:null (the real usage-fold proof is the un-mocked
// sort-results-usage-snapshot.integration.test.ts).
vi.mock("@/server/services/decision-log", () => ({
  loadCuratorDecisionEvents: async () => [],
}));

import {
  SortResultService,
  SupersedeStateError,
  DeleteResultStateError,
  FinalizeStateError,
  ResultNumberExhaustedError,
  PinTargetError,
} from "./SortResultService";
import type {
  CollectionPreferenceItem,
  SortResult,
  SortResultItem,
} from "@/types";
import type { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import type { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import type { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import type { Database } from "@/lib/db";
import { lockCollectionCurator } from "@/lib/transactions";

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
    usage: null,
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
  txResultRepo.findByIdForUpdate.mockResolvedValue(sortResult());
  txResultRepo.update.mockResolvedValue(sortResult({ status: "finalized" }));
  txItemRepo.create.mockResolvedValue(sortResultItem());
  txItemRepo.deleteByResult.mockResolvedValue(undefined);
  txResultRepo.findDrafts.mockResolvedValue([]);
  txItemRepo.findByResult.mockResolvedValue([]);
  txSessionRepo.findInProgress.mockResolvedValue(null);
  txSessionRepo.update.mockResolvedValue(undefined);
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
    } as unknown as CollectionPreferenceItemRepository;

    const result = await new SortResultService(
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
      preferenceRepo,
      txDb,
    ).createDraftResult(COLLECTION, CURATOR, "Spring sort");

    expect(result).toBe(created);
    // The in-tx reap ran but found no prior draft to delete.
    expect(txResultRepo.findDrafts).toHaveBeenCalledWith(COLLECTION, CURATOR);
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
    // Epic S: the create-input now carries the snapshot usage (null here — the
    // stubbed log is empty, so no item is usage-known).
    expect(txItemRepo.create).toHaveBeenNthCalledWith(1, {
      sortResultId: created.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
      usage: null,
    });
    expect(txItemRepo.create).toHaveBeenNthCalledWith(2, {
      sortResultId: created.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "medium",
      usage: null,
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
    } as unknown as CollectionPreferenceItemRepository;

    await expect(
      new SortResultService(
        {} as unknown as SortResultRepository,
        {} as unknown as SortResultItemRepository,
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
    } as unknown as CollectionPreferenceItemRepository;

    const result = await new SortResultService(
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
      preferenceRepo,
      txDb,
    ).createDraftResult(COLLECTION, CURATOR, "Empty sort");

    expect(result).toBe(created);
    expect(txItemRepo.create).not.toHaveBeenCalled();
  });
});

describe("pinItem targets", () => {
  // Only a Love/Like/Maybe piece of this curator can be pinned; the DB test
  // carries the foreign-collection 404, these carry the other two refusals.
  const service = () =>
    new SortResultService(
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    );

  it("refuses an untriaged piece and opens nothing", async () => {
    txPrefRepo.findByItem.mockResolvedValue(null);
    await expect(service().pinItem(COLLECTION, CURATOR, "item-1", 1)).rejects.toBeInstanceOf(PinTargetError);
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });

  it("refuses an Onward piece and opens nothing", async () => {
    txPrefRepo.findByItem.mockResolvedValue(preference({ collectionId: COLLECTION, rankBucket: "low" }));
    await expect(service().pinItem(COLLECTION, CURATOR, "item-1", 1)).rejects.toBeInstanceOf(PinTargetError);
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });
});

describe("SortResultService.finalizeResult", () => {
  // The tx-bound wiring is proven here (mirroring the other tx-primitive
  // tests in this file); the AUTHORITATIVE atomicity proof — both rows
  // actually moved together against a real DB — lives in the DB-tier
  // sort-results-pipeline.integration.test.ts.
  // The injected repo's pre-tx read only supplies the curator-lock key.
  function service() {
    return new SortResultService(
      { findById: async () => sortResult({ status: "draft" }) } as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    );
  }

  it("locks the row (tx-bound), finalizes it, and completes the curator's open session", async () => {
    const draft = sortResult({ status: "draft" });
    const finalized = sortResult({ status: "finalized", finalizedAt: new Date() });
    txResultRepo.findByIdForUpdate.mockResolvedValue(draft);
    txResultRepo.update.mockResolvedValue(finalized);
    const openSession = { id: "sess-1", collectionId: COLLECTION, curatorId: CURATOR, status: "active" };
    txSessionRepo.findInProgress.mockResolvedValue(openSession);

    const result = await service().finalizeResult("res-1");

    expect(result).toBe(finalized);
    expect(lockCollectionCurator).toHaveBeenCalledWith(expect.anything(), COLLECTION, CURATOR);
    expect(txResultRepo.findByIdForUpdate).toHaveBeenCalledWith("res-1");
    expect(txResultRepo.update).toHaveBeenCalledWith(
      "res-1",
      expect.objectContaining({ status: "finalized", finalizedAt: expect.any(Date) }),
    );
    expect(txSessionRepo.findInProgress).toHaveBeenCalledWith(COLLECTION, CURATOR);
    expect(txSessionRepo.update).toHaveBeenCalledWith("sess-1", { status: "completed" });
  });

  it("finalizes alone when no open session exists (no session write, no error)", async () => {
    txResultRepo.findByIdForUpdate.mockResolvedValue(sortResult({ status: "draft" }));
    txSessionRepo.findInProgress.mockResolvedValue(null);

    const result = await service().finalizeResult("res-1");

    expect(result.status).toBe("finalized");
    expect(txSessionRepo.update).not.toHaveBeenCalled();
  });

  it("throws FinalizeStateError when already finalized (no update, no session touched)", async () => {
    txResultRepo.findByIdForUpdate.mockResolvedValue(sortResult({ status: "finalized" }));

    await expect(service().finalizeResult("res-1")).rejects.toBeInstanceOf(FinalizeStateError);
    expect(txResultRepo.update).not.toHaveBeenCalled();
    expect(txSessionRepo.findInProgress).not.toHaveBeenCalled();
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
    } as unknown as SortResultRepository;
    const sortResultItemRepo = {
      findByResult: async () => oldItems,
    } as unknown as SortResultItemRepository;

    const result = await new SortResultService(
      sortResultRepo,
      sortResultItemRepo,
      {} as unknown as CollectionPreferenceItemRepository,
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
    // Fresh-fold: the clone drops manual fields and does not carry usage; usage
    // is re-derived here (empty stubbed log → null) and stamped by the create.
    expect(txItemRepo.create).toHaveBeenNthCalledWith(1, {
      sortResultId: newResult.id,
      itemId: "a",
      computedRank: 0,
      computedBucket: "top",
      usage: null,
    });
    expect(txItemRepo.create).toHaveBeenNthCalledWith(2, {
      sortResultId: newResult.id,
      itemId: "b",
      computedRank: 1,
      computedBucket: "low",
      usage: null,
    });
  });

  it("guard: returns null when the source is absent (never opens a tx)", async () => {
    const sortResultRepo = {
      findById: async () => null,
    } as unknown as SortResultRepository;

    const result = await new SortResultService(
      sortResultRepo,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    ).supersedeResult("missing");

    expect(result).toBeNull();
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });

  it("guard: throws SupersedeStateError when the source is not finalized (never opens a tx)", async () => {
    const sortResultRepo = {
      findById: async () => sortResult({ status: "draft" }),
    } as unknown as SortResultRepository;

    await expect(
      new SortResultService(
        sortResultRepo,
        {} as unknown as SortResultItemRepository,
        {} as unknown as CollectionPreferenceItemRepository,
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
    } as unknown as SortResultRepository;

    const deleted = await new SortResultService(
      sortResultRepo,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    ).deleteResult("missing");

    expect(deleted).toBe(false);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
    expect(txResultRepo.delete).not.toHaveBeenCalled();
  });

  it("throws DeleteResultStateError when the result is finalized (no tx deletes attempted)", async () => {
    const sortResultRepo = {
      findById: async () => sortResult({ status: "finalized" }),
    } as unknown as SortResultRepository;

    await expect(
      new SortResultService(
        sortResultRepo,
        {} as unknown as SortResultItemRepository,
        {} as unknown as CollectionPreferenceItemRepository,
        txDb,
      ).deleteResult("res-1"),
    ).rejects.toBeInstanceOf(DeleteResultStateError);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
    expect(txResultRepo.delete).not.toHaveBeenCalled();
  });

  it("re-asserts draft status under the curator lock (a save that finalized it meanwhile wins)", async () => {
    txResultRepo.findByIdForUpdate.mockResolvedValue(sortResult({ status: "finalized" }));
    await expect(
      new SortResultService(
        { findById: async () => sortResult({ status: "draft" }) } as unknown as SortResultRepository,
        {} as unknown as SortResultItemRepository,
        {} as unknown as CollectionPreferenceItemRepository,
        txDb,
      ).deleteResult("res-1"),
    ).rejects.toBeInstanceOf(DeleteResultStateError);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
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
    } as unknown as SortResultRepository;
    txResultRepo.findByIdForUpdate.mockResolvedValue(sortResult({ status: "draft" }));

    const deleted = await new SortResultService(
      sortResultRepo,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    ).deleteResult("res-1");

    expect(deleted).toBe(true);
    // Writes land on the tx-bound repos, not the injected ones.
    expect(txItemRepo.deleteByResult).toHaveBeenCalledWith("res-1");
    expect(txResultRepo.delete).toHaveBeenCalledWith("res-1");
    // Children-first: the sort_result_items -> sort_results FK has no cascade.
    expect(calls).toEqual(["children", "result"]);
    expect(lockCollectionCurator).toHaveBeenCalledWith(expect.anything(), COLLECTION, CURATOR);
  });
});

describe("SortResultService manual override", () => {
  it("setManualOverride / resetManualOverride write manual fields", async () => {
    const setUpdate = vi.fn(async () =>
      sortResultItem({ manualRank: 3, manualBucket: "top" }),
    );
    const setRepo = {
      update: setUpdate,
    } as unknown as SortResultItemRepository;

    await new SortResultService(
      {} as unknown as SortResultRepository,
      setRepo,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    ).setManualOverride("item-a", 3, "top");

    expect(setUpdate).toHaveBeenCalledWith(
      "item-a",
      expect.objectContaining({ manualRank: 3, manualBucket: "top" }),
    );

    const resetUpdate = vi.fn(async () => sortResultItem());
    const resetRepo = {
      update: resetUpdate,
    } as unknown as SortResultItemRepository;

    await new SortResultService(
      {} as unknown as SortResultRepository,
      resetRepo,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    ).resetManualOverride("item-a");

    expect(resetUpdate).toHaveBeenCalledWith(
      "item-a",
      expect.objectContaining({ manualRank: null, manualBucket: null }),
    );
  });
});
