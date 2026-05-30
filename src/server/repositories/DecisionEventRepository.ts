import type { DecisionEvent } from "@/types";

export interface IDecisionEventRepository {
  create(data: {
    sessionId: string;
    type: "triage" | "pairwise_compare";
    decision: Record<string, unknown>;
  }): Promise<DecisionEvent>;
  findById(id: string): Promise<DecisionEvent | null>;
  findBySession(sessionId: string): Promise<DecisionEvent[]>;
}
