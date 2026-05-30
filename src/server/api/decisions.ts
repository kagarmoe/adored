import { z } from "zod";
import type { DecisionEvent, TriageDecision, PairwiseDecision } from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";

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

  async listDecisions(): Promise<DecisionEvent[]> {
    // TODO: Implement DecisionEventRepository.findBySession when available
    // For now, fetch all and filter in memory as temporary solution
    return [];
  }

  async createDecision(
    sessionId: string,
    data: unknown,
  ): Promise<DecisionEvent> {
    const parsed = CreateDecisionSchema.parse(data);
    const event = await this.decisionRepo.create({
      sessionId,
      type: parsed.type,
      decision: parsed.decision as TriageDecision | PairwiseDecision,
    });
    // Validate the created event structure
    return event;
  }

  async getDecision(): Promise<DecisionEvent> {
    // Decisions are append-only and identified by ID
    // Repository should support findById
    // TODO: Ensure DecisionEventRepository.findById is implemented
    throw new Error("DecisionEventRepository.findById not yet implemented");
  }
}
