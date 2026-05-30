import type { DecisionEvent, DecisionType, TriageDecision, PairwiseDecision } from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";

export class DecisionEventService {
  constructor(private repo: IDecisionEventRepository) {}

  async recordTriageDecision(
    sessionId: string,
    itemId: string,
    result: "top" | "high" | "medium" | "low",
  ): Promise<DecisionEvent> {
    const decision: TriageDecision = { itemId, result };
    return this.repo.create({
      sessionId,
      type: "triage",
      decision,
    });
  }

  async recordPairwiseDecision(
    sessionId: string,
    itemAId: string,
    itemBId: string,
    result: "item_a" | "item_b" | "tie" | "skip",
  ): Promise<DecisionEvent> {
    const decision: PairwiseDecision = { itemAId, itemBId, result };
    return this.repo.create({
      sessionId,
      type: "pairwise_compare",
      decision,
    });
  }

  async getDecisionEvent(eventId: string): Promise<DecisionEvent | null> {
    return this.repo.findById(eventId);
  }

  async getSessionDecisions(sessionId: string): Promise<DecisionEvent[]> {
    return this.repo.findBySession(sessionId);
  }
}
