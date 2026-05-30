import { describe, it, expect, beforeEach, vi } from "vitest";
import { CollectionService } from "@/server/services/CollectionService";
import type { ICollectionRepository } from "@/server/repositories/CollectionRepository";

describe("CollectionService", () => {
  let mockRepo: ICollectionRepository;
  let service: CollectionService;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByOwner: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new CollectionService(mockRepo);
  });

  describe("createCollection", () => {
    it("creates a new collection owned by the creator", async () => {
      const mockCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Handbags",
        description: "My handbag collection",
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.create).mockResolvedValueOnce(mockCollection);

      const result = await service.createCollection({
        name: "Handbags",
        description: "My handbag collection",
        ownerId: "user-123",
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe("Handbags");
      expect(result.ownerId).toBe("user-123");
      expect(result.status).toBe("active");
    });
  });

  describe("getCollection", () => {
    it("returns collection by ID", async () => {
      const mockCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Handbags",
        description: null,
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockCollection);

      const result = await service.getCollection("coll-123");

      expect(result?.id).toBe("coll-123");
      expect(mockRepo.findById).toHaveBeenCalledWith("coll-123");
    });

    it("returns null for non-existent collection", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getCollection("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateCollection", () => {
    it("updates collection metadata", async () => {
      const updatedCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Updated Name",
        description: null,
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(updatedCollection);

      const result = await service.updateCollection("coll-123", {
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
    });
  });

  describe("archiveCollection", () => {
    it("archives a collection", async () => {
      const archivedCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Handbags",
        description: null,
        status: "archived" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(archivedCollection);

      const result = await service.archiveCollection("coll-123");

      expect(result.status).toBe("archived");
    });
  });

  describe("restoreCollection", () => {
    it("restores an archived collection", async () => {
      const restoredCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Handbags",
        description: null,
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(restoredCollection);

      const result = await service.restoreCollection("coll-123");

      expect(result.status).toBe("active");
    });
  });

  describe("deleteCollection", () => {
    it("soft-deletes a collection", async () => {
      const deletedCollection = {
        id: "coll-123",
        ownerId: "user-123",
        name: "Handbags",
        description: null,
        status: "deleted" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.mocked(mockRepo.softDelete).mockResolvedValueOnce(deletedCollection);

      const result = await service.deleteCollection("coll-123");

      expect(result.deletedAt).toBeDefined();
      expect(mockRepo.softDelete).toHaveBeenCalledWith("coll-123");
    });
  });
});
