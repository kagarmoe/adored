import { describe, it, expect, beforeEach, vi } from "vitest";
import { UserService } from "@/server/services/UserService";
import type { IUserRepository } from "@/server/repositories/UserRepository";

describe("UserService", () => {
  let mockRepo: IUserRepository;
  let service: UserService;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new UserService(mockRepo);
  });

  describe("getCurrentUser", () => {
    it("returns the current user", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockUser);

      const result = await service.getCurrentUser("user-123");

      expect(result).toEqual(mockUser);
      expect(mockRepo.findById).toHaveBeenCalledWith("user-123");
    });

    it("returns null for non-existent user", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getCurrentUser("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("updates user name and returns updated user", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "New Name",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(mockUser);

      const result = await service.updateProfile("user-123", { name: "New Name" });

      expect(result.name).toBe("New Name");
      expect(mockRepo.update).toHaveBeenCalledWith("user-123", expect.objectContaining({ name: "New Name" }));
    });
  });

  describe("deleteAccount", () => {
    it("soft-deletes user account", async () => {
      const mockUser = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.mocked(mockRepo.softDelete).mockResolvedValueOnce(mockUser);

      const result = await service.deleteAccount("user-123");

      expect(result.deletedAt).toBeDefined();
      expect(mockRepo.softDelete).toHaveBeenCalledWith("user-123");
    });
  });
});
