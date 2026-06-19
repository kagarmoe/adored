import { describe, expect, it, vi } from "vitest";
import { DecisionEventService } from "./DecisionEventService";
import type { DecisionEvent } from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";

const SESSION = "sess-1";

function decisionEvent(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    id: "evt-1",
    sessionId: SESSION,
    type: "triage",
    decision: { itemId: "a", result: "top" },
    createdAt: new Date(),
    ...overrides,
  };
}

describe("DecisionEventService.recordTriageDecision", () => {
  it("recordTriageDecision creates a triage event with {itemId,result}", async () => {
    const created = decisionEvent();
    const create = vi.fn(async () => created);
    const repo = { create } as unknown as IDecisionEventRepository;

    const result = await new DecisionEventService(repo).recordTriageDecision(
      SESSION,
      "a",
      "high",
    );

    expect(create).toHaveBeenCalledWith({
      sessionId: SESSION,
      type: "triage",
      decision: { itemId: "a", result: "high" },
    });
    expect(result).toBe(created);
  });
});

describe("DecisionEventService.recordPairwiseDecision", () => {
  it("recordPairwiseDecision creates a pairwise_compare event with {itemAId,itemBId,result}", async () => {
    const created = decisionEvent({
      type: "pairwise_compare",
      decision: { itemAId: "a", itemBId: "b", result: "item_a" },
    });
    const create = vi.fn(async () => created);
    const repo = { create } as unknown as IDecisionEventRepository;

    const result = await new DecisionEventService(repo).recordPairwiseDecision(
      SESSION,
      "a",
      "b",
      "item_a",
    );

    expect(create).toHaveBeenCalledWith({
      sessionId: SESSION,
      type: "pairwise_compare",
      decision: { itemAId: "a", itemBId: "b", result: "item_a" },
    });
    expect(result).toBe(created);
  });
});

describe("DecisionEventService read-through accessors", () => {
  it("getSessionDecisions / getDecisionEvent pass through", async () => {
    const list = [decisionEvent(), decisionEvent({ id: "evt-2" })];
    const single = decisionEvent({ id: "evt-2" });
    const repo = {
      findBySession: async () => list,
      findById: async () => single,
    } as unknown as IDecisionEventRepository;

    const service = new DecisionEventService(repo);

    expect(await service.getSessionDecisions(SESSION)).toBe(list);
    expect(await service.getDecisionEvent("evt-2")).toBe(single);
  });
});
