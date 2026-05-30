import { describe, it, expect, beforeEach, vi } from "vitest";
import { DecisionEventService } from "@/server/services/DecisionEventService";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";

describe("DecisionEventService", () => {
  let mockRepo: IDecisionEventRepository;
  let service: DecisionEventService;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySession: vi.fn(),
    };
    service = new DecisionEventService(mockRepo);
  });

  describe("recordTriageDecision", () => {
    it("records a triage decision event", async () => {
      const triageDecision: TriageDecision = {
        itemId: "item-1",
        result: "top",
      };
      const mockEvent: DecisionEvent = {
        id: "event-123",
        sessionId: "sess-123",
        type: "triage",
        decision: triageDecision,
        createdAt: new Date(),
      };

      vi.mocked(mockRepo.create).mockResolvedValueOnce(mockEvent);

      const result = await service.recordTriageDecision(
        "sess-123",
        "item-1",
        "top",
      );

      expect(result.id).toBeDefined();
      expect(result.type).toBe("triage");
      expect(mockRepo.create).toHaveBeenCalledWith({
        sessionId: "sess-123",
        type: "triage",
        decision: { itemId: "item-1", result: "top" },
      });
    });
  });

  describe("recordPairwiseDecision", () => {
    it("records a pairwise comparison decision event", async () => {
      const pairwiseDecision: PairwiseDecision = {
        itemAId: "item-1",
        itemBId: "item-2",
        result: "item_a",
      };
      const mockEvent: DecisionEvent = {
        id: "event-124",
        sessionId: "sess-123",
        type: "pairwise_compare",
        decision: pairwiseDecision,
        createdAt: new Date(),
      };

      vi.mocked(mockRepo.create).mockResolvedValueOnce(mockEvent);

      const result = await service.recordPairwiseDecision(
        "sess-123",
        "item-1",
        "item-2",
        "item_a",
      );

      expect(result.type).toBe("pairwise_compare");
      expect(mockRepo.create).toHaveBeenCalledWith({
        sessionId: "sess-123",
        type: "pairwise_compare",
        decision: { itemAId: "item-1", itemBId: "item-2", result: "item_a" },
      });
    });
  });

  describe("getSessionDecisions", () => {
    it("returns all decisions for a session", async () => {
      const triageDecision: TriageDecision = { itemId: "item-1", result: "top" };
      const pairwiseDecision: PairwiseDecision = {
        itemAId: "item-2",
        itemBId: "item-3",
        result: "tie",
      };

      const mockEvents: DecisionEvent[] = [
        {
          id: "event-1",
          sessionId: "sess-123",
          type: "triage",
          decision: triageDecision,
          createdAt: new Date(),
        },
        {
          id: "event-2",
          sessionId: "sess-123",
          type: "pairwise_compare",
          decision: pairwiseDecision,
          createdAt: new Date(),
        },
      ];

      vi.mocked(mockRepo.findBySession).mockResolvedValueOnce(mockEvents);

      const result = await service.getSessionDecisions("sess-123");

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("triage");
      expect(result[1].type).toBe("pairwise_compare");
    });
  });

  describe("getDecisionEvent", () => {
    it("returns a specific decision event", async () => {
      const triageDecision: TriageDecision = {
        itemId: "item-1",
        result: "top",
      };
      const mockEvent: DecisionEvent = {
        id: "event-123",
        sessionId: "sess-123",
        type: "triage",
        decision: triageDecision,
        createdAt: new Date(),
      };

      vi.mocked(mockRepo.findById).mockResolvedValueOnce(mockEvent);

      const result = await service.getDecisionEvent("event-123");

      expect(result?.id).toBe("event-123");
      expect(mockRepo.findById).toHaveBeenCalledWith("event-123");
    });

    it("returns null for non-existent event", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await service.getDecisionEvent("nonexistent");

      expect(result).toBeNull();
    });
  });
});
