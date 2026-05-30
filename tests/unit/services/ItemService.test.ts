import { describe, it, expect, beforeEach, vi } from "vitest";
import { ItemService } from "@/server/services/ItemService";
import type { IItemRepository } from "@/server/repositories/ItemRepository";

describe("ItemService", () => {
  let mockRepo: IItemRepository;
  let service: ItemService;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new ItemService(mockRepo);
  });

  describe("createItem", () => {
    it("creates a new item in a collection", async () => {
      const mockItem = {
        id: "item-123",
        collectionId: "coll-123",
        name: "Red Leather Handbag",
        brand: "Coach",
        style: "Tote",
        color: "Red",
        material: "Leather",
        category: "Handbag",
        status: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.create).mockResolvedValueOnce(mockItem);

      const result = await service.createItem("coll-123", {
        name: "Red Leather Handbag",
        brand: "Coach",
        style: "Tote",
        color: "Red",
        material: "Leather",
        category: "Handbag",
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe("Red Leather Handbag");
      expect(result.collectionId).toBe("coll-123");
    });
  });

  describe("getItem", () => {
    it("returns item by ID", async () => {
      const mockItem = {
        id: "item-123",
        collectionId: "coll-123",
        name: "Red Leather Handbag",
        brand: "Coach",
        style: null,
        color: null,
        material: null,
        category: null,
        status: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockItem);

      const result = await service.getItem("item-123");

      expect(result?.id).toBe("item-123");
    });

    it("returns null for non-existent item", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getItem("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getCollectionItems", () => {
    it("returns all items in a collection", async () => {
      const mockItems = [
        {
          id: "item-1",
          collectionId: "coll-123",
          name: "Item 1",
          brand: null,
          style: null,
          color: null,
          material: null,
          category: null,
          status: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: "item-2",
          collectionId: "coll-123",
          name: "Item 2",
          brand: null,
          style: null,
          color: null,
          material: null,
          category: null,
          status: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      vi.mocked(mockRepo.findByCollection).mockResolvedValueOnce(mockItems);

      const result = await service.getCollectionItems("coll-123");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Item 1");
    });

    it("returns empty array for empty collection", async () => {
      vi.mocked(mockRepo.findByCollection).mockResolvedValueOnce([]);

      const result = await service.getCollectionItems("coll-empty");

      expect(result).toHaveLength(0);
    });
  });

  describe("updateItem", () => {
    it("updates item metadata", async () => {
      const updatedItem = {
        id: "item-123",
        collectionId: "coll-123",
        name: "Updated Name",
        brand: null,
        style: null,
        color: null,
        material: null,
        category: null,
        status: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(updatedItem);

      const result = await service.updateItem("item-123", { name: "Updated Name" });

      expect(result.name).toBe("Updated Name");
    });
  });

  describe("deleteItem", () => {
    it("soft-deletes an item", async () => {
      const deletedItem = {
        id: "item-123",
        collectionId: "coll-123",
        name: "Item",
        brand: null,
        style: null,
        color: null,
        material: null,
        category: null,
        status: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.mocked(mockRepo.softDelete).mockResolvedValueOnce(deletedItem);

      const result = await service.deleteItem("item-123");

      expect(result.deletedAt).toBeDefined();
    });
  });

  describe("restoreItem", () => {
    it("restores a deleted item", async () => {
      const restoredItem = {
        id: "item-123",
        collectionId: "coll-123",
        name: "Item",
        brand: null,
        style: null,
        color: null,
        material: null,
        category: null,
        status: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(restoredItem);

      const result = await service.restoreItem("item-123");

      expect(result.deletedAt).toBeNull();
      expect(mockRepo.update).toHaveBeenCalledWith("item-123", {
        deletedAt: null,
        updatedAt: expect.any(Date),
      });
    });
  });
});
