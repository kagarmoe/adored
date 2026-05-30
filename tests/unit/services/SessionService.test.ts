import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionService } from "@/server/services/SessionService";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

describe("SessionService", () => {
  let mockRepo: ISessionRepository;
  let service: SessionService;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findActive: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new SessionService(mockRepo);
  });

  describe("createSession", () => {
    it("creates a new session", async () => {
      const mockSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "active" as const,
        goal: "quick triage",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findActive).mockResolvedValueOnce(null);
      vi.mocked(mockRepo.create).mockResolvedValueOnce(mockSession);

      const result = await service.createSession("coll-123", "user-123", "quick triage");

      expect(result.id).toBeDefined();
      expect(result.status).toBe("active");
      expect(result.goal).toBe("quick triage");
    });

    it("throws if active session already exists", async () => {
      const existingSession = {
        id: "sess-existing",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "active" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findActive).mockResolvedValueOnce(existingSession);

      await expect(
        service.createSession("coll-123", "user-123"),
      ).rejects.toThrow("Active session already exists");
    });
  });

  describe("getActiveSession", () => {
    it("returns active session for curator", async () => {
      const mockSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "active" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findActive).mockResolvedValueOnce(mockSession);

      const result = await service.getActiveSession("coll-123", "user-123");

      expect(result?.status).toBe("active");
    });

    it("returns null if no active session", async () => {
      vi.mocked(mockRepo.findActive).mockResolvedValueOnce(null);

      const result = await service.getActiveSession("coll-123", "user-123");

      expect(result).toBeNull();
    });
  });

  describe("pauseSession", () => {
    it("pauses an active session", async () => {
      const pausedSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "paused" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(pausedSession);

      const result = await service.pauseSession("sess-123");

      expect(result.status).toBe("paused");
    });
  });

  describe("getSession", () => {
    it("returns session by ID", async () => {
      const mockSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "active" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockSession);

      const result = await service.getSession("sess-123");

      expect(result?.id).toBe("sess-123");
      expect(mockRepo.findById).toHaveBeenCalledWith("sess-123");
    });

    it("returns null for non-existent session", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getSession("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getCollectionSessions", () => {
    it("returns all sessions for a collection", async () => {
      const mockSessions = [
        {
          id: "sess-1",
          collectionId: "coll-123",
          curatorId: "user-123",
          status: "completed" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: "sess-2",
          collectionId: "coll-123",
          curatorId: "user-456",
          status: "active" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      vi.mocked(mockRepo.findByCollection).mockResolvedValueOnce(mockSessions);

      const result = await service.getCollectionSessions("coll-123");

      expect(result).toHaveLength(2);
      expect(mockRepo.findByCollection).toHaveBeenCalledWith("coll-123");
    });
  });

  describe("resumeSession", () => {
    it("resumes a paused session", async () => {
      const resumedSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "active" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(resumedSession);

      const result = await service.resumeSession("sess-123");

      expect(result.status).toBe("active");
    });
  });

  describe("completeSession", () => {
    it("completes a session", async () => {
      const completedSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "completed" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(completedSession);

      const result = await service.completeSession("sess-123");

      expect(result.status).toBe("completed");
    });
  });

  describe("abandonSession", () => {
    it("abandons a session", async () => {
      const abandonedSession = {
        id: "sess-123",
        collectionId: "coll-123",
        curatorId: "user-123",
        status: "abandoned" as const,
        goal: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockRepo.update).mockResolvedValueOnce(abandonedSession);

      const result = await service.abandonSession("sess-123");

      expect(result.status).toBe("abandoned");
    });
  });
});
