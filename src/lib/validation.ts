import { z } from "zod";
import type { TriageDecision, PairwiseDecision, DecisionEvent } from "@/types";

const TriageDecisionSchema = z.object({
  itemId: z.string(),
  result: z.enum(["top", "high", "medium", "low"]),
});

const PairwiseDecisionSchema = z.object({
  itemAId: z.string(),
  itemBId: z.string(),
  result: z.enum(["item_a", "item_b", "tie", "skip"]),
});

const DecisionEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.enum(["triage", "pairwise_compare"]),
  decision: z.union([TriageDecisionSchema, PairwiseDecisionSchema]),
  createdAt: z.date(),
});

export function validateDecisionEvent(data: unknown): DecisionEvent {
  try {
    return DecisionEventSchema.parse(data);
  } catch (error) {
    throw new Error(`Invalid DecisionEvent: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateTriageDecision(data: unknown): TriageDecision {
  try {
    return TriageDecisionSchema.parse(data);
  } catch (error) {
    throw new Error(`Invalid TriageDecision: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validatePairwiseDecision(data: unknown): PairwiseDecision {
  try {
    return PairwiseDecisionSchema.parse(data);
  } catch (error) {
    throw new Error(`Invalid PairwiseDecision: ${error instanceof Error ? error.message : String(error)}`);
  }
}
