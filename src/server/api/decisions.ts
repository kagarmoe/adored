import { z } from "zod";
import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import { validateDecisionEvent } from "@/lib/validation";

const TriageDecisionSchema = z.object({
  itemId: z.string(),
  result: z.enum(["top", "high", "medium", "low"]),
});

const PairwiseDecisionSchema = z.object({
  itemAId: z.string(),
  itemBId: z.string(),
  result: z.enum(["item_a", "item_b", "tie", "skip"]),
});

const CreateDecisionSchema = z.object({
  type: z.enum(["triage", "pairwise_compare"]),
  decision: z.union([TriageDecisionSchema, PairwiseDecisionSchema]),
});

export type CreateDecisionInput = z.infer<typeof CreateDecisionSchema>;

export class DecisionController {
  constructor(private decisionRepo: IDecisionEventRepository) {}

  async listDecisions(sessionId: string): Promise<DecisionEvent[]> {
    // TODO: Implement when DecisionEventRepository.findBySession available
    return [];
  }

  async createDecision(
    sessionId: string,
    data: unknown,
  ): Promise<DecisionEvent> {
    const parsed = CreateDecisionSchema.parse(data);
    return this.decisionRepo.create({
      sessionId,
      type: parsed.type,
      decision: parsed.decision as TriageDecision | PairwiseDecision,
    });
  }

  async getDecision(decisionEventId: string): Promise<DecisionEvent> {
    // TODO: Implement when DecisionEventRepository.findById available
    throw new Error("Not implemented");
  }
}
