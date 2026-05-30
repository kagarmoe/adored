import { describe, it, expect, beforeEach, vi } from "vitest";
import { PairingService } from "@/server/services/PairingService";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { Item } from "@/types";

describe("PairingService", () => {
  let itemRepo: IItemRepository;
  let preferenceRepo: ICollectionPreferenceItemRepository;
  let service: PairingService;

  const mockItem = (id: string, overrides?: Partial<Item>): Item => ({
    id,
    collectionId: "coll-1",
    name: `Item ${id}`,
    brand: "TestBrand",
    style: null,
    color: null,
    material: null,
    category: null,
    status: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    itemRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    preferenceRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByItem: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      clear: vi.fn(),
    };
    service = new PairingService(itemRepo, preferenceRepo);
  });

  describe("selectNextPair", () => {
    it("returns null if collection has fewer than 2 items", async () => {
      vi.mocked(itemRepo.findByCollection).mockResolvedValueOnce([
        mockItem("item-1"),
      ]);

      const result = await service.selectNextPair("coll-1", "curator-1");

      expect(result).toBeNull();
    });

    it("selects pair with preference consideration", async () => {
      const items = [
        mockItem("item-1"),
        mockItem("item-2"),
        mockItem("item-3"),
      ];

      vi.mocked(itemRepo.findByCollection).mockResolvedValueOnce(items);
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce([
        {
          id: "pref-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          itemId: "item-1",
          score: 0.8,
          confidence: 0.9,
          rankBucket: "top",
          comparisonCount: 5,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.selectNextPair("coll-1", "curator-1");

      expect(result).not.toBeNull();
      expect(result?.itemA).toBeDefined();
      expect(result?.itemB).toBeDefined();
    });

    it("prioritizes items with low comparison count", async () => {
      const items = [
        mockItem("item-1"),
        mockItem("item-2"),
      ];

      vi.mocked(itemRepo.findByCollection).mockResolvedValueOnce(items);
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce([
        {
          id: "pref-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          itemId: "item-1",
          score: 0.8,
          confidence: 0.9,
          rankBucket: "top",
          comparisonCount: 15,
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
          confidence: 0.5,
          rankBucket: "high",
          comparisonCount: 3,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.selectNextPair("coll-1", "curator-1");

      expect([result?.itemA.id, result?.itemB.id]).toContain("item-2");
    });
  });

  describe("prioritizeByGoal", () => {
    it("returns items unchanged if no goal specified", async () => {
      const items = [mockItem("item-1"), mockItem("item-2")];

      const result = await service.prioritizeByGoal(items, null);

      expect(result).toEqual(items);
    });

    it("prioritizes favorite items for favorites goal", async () => {
      const items = [
        mockItem("item-1", { status: null }),
        mockItem("item-2", { status: "favorite" }),
      ];

      const result = await service.prioritizeByGoal(items, "refine favorites");

      expect(result[0].id).toBe("item-2");
    });

    it("prioritizes items with metadata for triage goal", async () => {
      const items = [
        mockItem("item-1", { brand: null, style: null }),
        mockItem("item-2", { brand: "Coach", style: "Tote" }),
      ];

      const result = await service.prioritizeByGoal(items, "quick triage");

      expect(result[0].id).toBe("item-2");
    });

    it("prioritizes items with notes for refine goal", async () => {
      const items = [
        mockItem("item-1", { notes: null }),
        mockItem("item-2", { notes: "Recently worn" }),
      ];

      const result = await service.prioritizeByGoal(items, "refine collection");

      expect(result[0].id).toBe("item-2");
    });
  });
});
