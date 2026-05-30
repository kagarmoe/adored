import { describe, it, expect, beforeEach, vi } from "vitest";
import { SortResultService } from "@/server/services/SortResultService";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { SortResult, SortResultItem } from "@/types";

describe("SortResultService", () => {
  let sortResultRepo: ISortResultRepository;
  let sortResultItemRepo: ISortResultItemRepository;
  let preferenceRepo: ICollectionPreferenceItemRepository;
  let service: SortResultService;

  const mockResult = (overrides?: Partial<SortResult>): SortResult => ({
    id: "result-1",
    collectionId: "coll-1",
    curatorId: "curator-1",
    status: "draft",
    name: "My Sort",
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: null,
    ...overrides,
  });

  const mockResultItem = (overrides?: Partial<SortResultItem>): SortResultItem => ({
    id: "item-1",
    sortResultId: "result-1",
    itemId: "item-1",
    computedRank: 0,
    computedBucket: "top",
    manualRank: null,
    manualBucket: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sortResultRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCollection: vi.fn(),
      findDraft: vi.fn(),
      update: vi.fn(),
    };
    sortResultItemRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByResult: vi.fn(),
      update: vi.fn(),
    };
    preferenceRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByItem: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      clear: vi.fn(),
    };
    service = new SortResultService(sortResultRepo, sortResultItemRepo, preferenceRepo);
  });

  describe("createDraftResult", () => {
    it("creates a draft result with items from preferences", async () => {
      const mockResult_ = mockResult({ id: "result-new" });
      const prefs = [
        {
          id: "pref-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          itemId: "item-1",
          score: 0.9,
          confidence: 0.9,
          rankBucket: "top" as const,
          comparisonCount: 5,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "pref-2",
          collectionId: "coll-1",
          curatorId: "curator-1",
          itemId: "item-2",
          score: 0.5,
          confidence: 0.7,
          rankBucket: "medium" as const,
          comparisonCount: 3,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(sortResultRepo.create).mockResolvedValueOnce(mockResult_);
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce(prefs);
      vi.mocked(sortResultItemRepo.create).mockResolvedValueOnce(mockResultItem());

      const result = await service.createDraftResult("coll-1", "curator-1", "My Sort");

      expect(sortResultRepo.create).toHaveBeenCalledWith({
        collectionId: "coll-1",
        curatorId: "curator-1",
        name: "My Sort",
        status: "draft",
      });
      expect(sortResultItemRepo.create).toHaveBeenCalledTimes(2);
      expect(result.status).toBe("draft");
    });
  });

  describe("getResult", () => {
    it("returns result with items", async () => {
      const mockResult_ = mockResult({ id: "result-1" });
      const mockItems = [
        mockResultItem({ id: "item-1", computedRank: 0 }),
        mockResultItem({ id: "item-2", computedRank: 1 }),
      ];

      vi.mocked(sortResultRepo.findById).mockResolvedValueOnce(mockResult_);
      vi.mocked(sortResultItemRepo.findByResult).mockResolvedValueOnce(mockItems);

      const result = await service.getResult("result-1");

      expect(result?.result).toEqual(mockResult_);
      expect(result?.items).toEqual(mockItems);
    });

    it("returns null if result not found", async () => {
      vi.mocked(sortResultRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getResult("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateResultName", () => {
    it("updates result name", async () => {
      const updated = mockResult({ name: "Updated Name" });
      vi.mocked(sortResultRepo.update).mockResolvedValueOnce(updated);

      const result = await service.updateResultName("result-1", "Updated Name");

      expect(result.name).toBe("Updated Name");
    });
  });

  describe("setManualOverride", () => {
    it("sets manual rank and bucket", async () => {
      const updated = mockResultItem({ manualRank: 5, manualBucket: "high" });
      vi.mocked(sortResultItemRepo.update).mockResolvedValueOnce(updated);

      const result = await service.setManualOverride("item-1", 5, "high");

      expect(result.manualRank).toBe(5);
      expect(result.manualBucket).toBe("high");
    });
  });

  describe("resetManualOverride", () => {
    it("resets manual overrides to null", async () => {
      const reset = mockResultItem({ manualRank: null, manualBucket: null });
      vi.mocked(sortResultItemRepo.update).mockResolvedValueOnce(reset);

      const result = await service.resetManualOverride("item-1");

      expect(result.manualRank).toBeNull();
      expect(result.manualBucket).toBeNull();
    });
  });

  describe("finalizeResult", () => {
    it("finalizes a draft result", async () => {
      const finalized = mockResult({ status: "finalized", finalizedAt: new Date() });
      vi.mocked(sortResultRepo.update).mockResolvedValueOnce(finalized);

      const result = await service.finalizeResult("result-1");

      expect(result.status).toBe("finalized");
      expect(result.finalizedAt).not.toBeNull();
    });
  });

  describe("supersedeResult", () => {
    it("creates new draft from finalized result", async () => {
      const oldResult = mockResult({ id: "result-1", status: "finalized" });
      const newResult = mockResult({ id: "result-2", name: "My Sort (Revision)" });
      const items = [mockResultItem({ id: "item-1" })];

      vi.mocked(sortResultRepo.findById).mockResolvedValueOnce(oldResult);
      vi.mocked(sortResultRepo.create).mockResolvedValueOnce(newResult);
      vi.mocked(sortResultItemRepo.findByResult).mockResolvedValueOnce(items);
      vi.mocked(sortResultItemRepo.create).mockResolvedValueOnce(mockResultItem());

      const result = await service.supersedeResult("result-1");

      expect(result?.status).toBe("draft");
      expect(result?.name).toContain("Revision");
    });
  });
});
