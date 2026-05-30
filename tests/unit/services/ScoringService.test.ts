import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScoringService } from "@/server/services/ScoringService";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";
import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";

describe("ScoringService", () => {
  let decisionRepo: IDecisionEventRepository;
  let sessionRepo: ISessionRepository;
  let service: ScoringService;

  beforeEach(() => {
    decisionRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySession: vi.fn(),
    };
    sessionRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findActive: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new ScoringService(decisionRepo, sessionRepo);
  });

  describe("computePreferences", () => {
    it("computes all preferences for a collection and curator", async () => {
      const mockSessions = [
        {
          id: "sess-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          status: "completed" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      const triageDecision1: TriageDecision = { itemId: "item-1", result: "top" };
      const triageDecision2: TriageDecision = { itemId: "item-2", result: "medium" };

      const mockDecisions: DecisionEvent[] = [
        {
          id: "event-1",
          sessionId: "sess-1",
          type: "triage",
          decision: triageDecision1,
          createdAt: new Date(),
        },
        {
          id: "event-2",
          sessionId: "sess-1",
          type: "triage",
          decision: triageDecision2,
          createdAt: new Date(),
        },
      ];

      vi.mocked(sessionRepo.findByCollection).mockResolvedValueOnce(mockSessions);
      vi.mocked(decisionRepo.findBySession).mockResolvedValueOnce(mockDecisions);

      const result = await service.computePreferences("coll-1", "curator-1");

      expect(result.length).toBe(2);
      expect(result[0].itemId).toBe("item-1");
      expect(result[0].score).toBe(1.0);
      expect(result[0].rankBucket).toBe("top");
      expect(result[1].itemId).toBe("item-2");
      expect(result[1].score).toBe(0.5);
      expect(result[1].rankBucket).toBe("high");
    });

    it("handles pairwise comparisons in scoring", async () => {
      const mockSessions = [
        {
          id: "sess-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          status: "completed" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      const pairwiseDecision: PairwiseDecision = {
        itemAId: "item-1",
        itemBId: "item-2",
        result: "item_a",
      };

      const mockDecisions: DecisionEvent[] = [
        {
          id: "event-1",
          sessionId: "sess-1",
          type: "pairwise_compare",
          decision: pairwiseDecision,
          createdAt: new Date(),
        },
      ];

      vi.mocked(sessionRepo.findByCollection).mockResolvedValueOnce(mockSessions);
      vi.mocked(decisionRepo.findBySession).mockResolvedValueOnce(mockDecisions);

      const result = await service.computePreferences("coll-1", "curator-1");

      expect(result.length).toBe(2);
      const item1 = result.find((p) => p.itemId === "item-1");
      const item2 = result.find((p) => p.itemId === "item-2");
      expect(item1?.score).toBeGreaterThan(0);
      expect(item2?.score).toBeLessThan(item1?.score || 0);
    });

    it("filters sessions by curator", async () => {
      const mockSessions = [
        {
          id: "sess-1",
          collectionId: "coll-1",
          curatorId: "curator-1",
          status: "completed" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: "sess-2",
          collectionId: "coll-1",
          curatorId: "curator-2",
          status: "completed" as const,
          goal: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      vi.mocked(sessionRepo.findByCollection).mockResolvedValueOnce(mockSessions);
      vi.mocked(decisionRepo.findBySession).mockResolvedValueOnce([]);

      await service.computePreferences("coll-1", "curator-1");

      expect(decisionRepo.findBySession).toHaveBeenCalledWith("sess-1");
      expect(decisionRepo.findBySession).not.toHaveBeenCalledWith("sess-2");
    });
  });
});
