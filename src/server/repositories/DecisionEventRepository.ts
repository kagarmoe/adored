import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";

export interface IDecisionEventRepository {
  create(data: {
    sessionId: string;
    type: "triage" | "pairwise_compare";
    decision: TriageDecision | PairwiseDecision;
  }): Promise<DecisionEvent>;
  findById(id: string): Promise<DecisionEvent | null>;
  findBySession(sessionId: string): Promise<DecisionEvent[]>;
  // Delete every decision of the collection's sessions (scoped via the parent
  // sessions — no collection_id column). Purge-only.
  deleteByCollection(collectionId: string): Promise<void>;
}
