import { describe, it, expect, beforeEach, vi } from "vitest";
import { SortResultShareService } from "@/server/services/SortResultShareService";
import type { ISortResultShareRepository } from "@/server/repositories/SortResultShareRepository";
import type { ISortResultRepository, ISortResultItemRepository } from "@/server/repositories/SortResultRepository";
import type { SortResultShare, SortResult, SortResultItem } from "@/types";

describe("SortResultShareService", () => {
  let shareRepo: ISortResultShareRepository;
  let resultRepo: ISortResultRepository;
  let resultItemRepo: ISortResultItemRepository;
  let service: SortResultShareService;

  const mockShare = (overrides?: Partial<SortResultShare>): SortResultShare => ({
    id: "share-1",
    sortResultId: "result-1",
    shareToken: "token123",
    status: "active",
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockResult = (overrides?: Partial<SortResult>): SortResult => ({
    id: "result-1",
    collectionId: "coll-1",
    curatorId: "curator-1",
    status: "finalized",
    name: "My Sort",
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: new Date(),
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
    shareRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByResult: vi.fn(),
      update: vi.fn(),
    };
    resultRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCollection: vi.fn(),
      findDraft: vi.fn(),
      update: vi.fn(),
    };
    resultItemRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByResult: vi.fn(),
      update: vi.fn(),
    };
    service = new SortResultShareService(shareRepo, resultRepo, resultItemRepo);
  });

  describe("createShare", () => {
    it("creates share with token", async () => {
      const mockShare_ = mockShare();
      vi.mocked(shareRepo.create).mockResolvedValueOnce(mockShare_);

      await service.createShare("result-1");

      expect(shareRepo.create).toHaveBeenCalled();
      const call = vi.mocked(shareRepo.create).mock.calls[0][0];
      expect(call.sortResultId).toBe("result-1");
      expect(call.shareToken).toBeTruthy();
      expect(call.shareToken.length).toBeGreaterThan(0);
    });

    it("sets expiry if provided", async () => {
      vi.mocked(shareRepo.create).mockResolvedValueOnce(
        mockShare({ expiresAt: new Date() }),
      );

      await service.createShare("result-1", 7);

      const call = vi.mocked(shareRepo.create).mock.calls[0][0];
      expect(call.expiresAt).toBeTruthy();
    });
  });

  describe("viewSharedResult", () => {
    it("returns shared result data for valid token", async () => {
      const mockShare_ = mockShare({ status: "active", expiresAt: null });
      const mockResult_ = mockResult();
      const mockItems = [
        mockResultItem({ itemId: "item-1" }),
        mockResultItem({ itemId: "item-2", id: "item-2", computedRank: 1 }),
      ];

      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(mockShare_);
      vi.mocked(resultRepo.findById).mockResolvedValueOnce(mockResult_);
      vi.mocked(resultItemRepo.findByResult).mockResolvedValueOnce(mockItems);

      const result = await service.viewSharedResult("token123");

      expect(result).not.toBeNull();
      expect(result?.resultName).toBe("My Sort");
      expect(result?.items).toHaveLength(2);
    });

    it("returns null for revoked share", async () => {
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(
        mockShare({ status: "revoked" }),
      );

      const result = await service.viewSharedResult("token123");

      expect(result).toBeNull();
    });

    it("returns null for expired share", async () => {
      const pastDate = new Date(Date.now() - 1000);
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(
        mockShare({ expiresAt: pastDate }),
      );

      const result = await service.viewSharedResult("token123");

      expect(result).toBeNull();
    });

    it("returns null for invalid token", async () => {
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(null);

      const result = await service.viewSharedResult("invalid");

      expect(result).toBeNull();
    });
  });

  describe("revokeShare", () => {
    it("marks share as revoked", async () => {
      vi.mocked(shareRepo.update).mockResolvedValueOnce(
        mockShare({ status: "revoked" }),
      );

      const result = await service.revokeShare("share-1");

      expect(result.status).toBe("revoked");
    });
  });

  describe("getResultShares", () => {
    it("returns all shares for result", async () => {
      const shares = [mockShare({ id: "share-1" }), mockShare({ id: "share-2" })];
      vi.mocked(shareRepo.findByResult).mockResolvedValueOnce(shares);

      const result = await service.getResultShares("result-1");

      expect(result).toHaveLength(2);
    });
  });

  describe("isShareValid", () => {
    it("returns true for valid active share", async () => {
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(
        mockShare({ status: "active", expiresAt: null }),
      );

      const result = await service.isShareValid("token123");

      expect(result).toBe(true);
    });

    it("returns false for revoked share", async () => {
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(
        mockShare({ status: "revoked" }),
      );

      const result = await service.isShareValid("token123");

      expect(result).toBe(false);
    });

    it("returns false for expired share", async () => {
      const pastDate = new Date(Date.now() - 1000);
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(
        mockShare({ expiresAt: pastDate }),
      );

      const result = await service.isShareValid("token123");

      expect(result).toBe(false);
    });

    it("returns false for invalid token", async () => {
      vi.mocked(shareRepo.findByToken).mockResolvedValueOnce(null);

      const result = await service.isShareValid("invalid");

      expect(result).toBe(false);
    });
  });
});
