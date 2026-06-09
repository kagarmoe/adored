import { describe, expect, it } from "vitest";
import { ScoringService } from "./ScoringService";
import type {
  DecisionEvent,
  PairwiseResult,
  Session,
  TriageResult,
} from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

const COLLECTION = "col-1";
const CURATOR = "cur-1";
const SESSION = "sess-1";

function triage(itemId: string, result: TriageResult): DecisionEvent {
  return {
    id: `t-${itemId}-${result}`,
    sessionId: SESSION,
    type: "triage",
    decision: { itemId, result },
    createdAt: new Date(),
  };
}

function pairwise(
  itemAId: string,
  itemBId: string,
  result: PairwiseResult,
): DecisionEvent {
  return {
    id: `p-${itemAId}-${itemBId}-${result}`,
    sessionId: SESSION,
    type: "pairwise_compare",
    decision: { itemAId, itemBId, result },
    createdAt: new Date(),
  };
}

// Builds a ScoringService whose curator has one session containing `decisions`,
// processed in array order (triage phase before pairwise phase, as in the app).
function buildService(decisions: DecisionEvent[]): ScoringService {
  const sessionRepo: ISessionRepository = {
    findByCollection: async () =>
      [{ id: SESSION, curatorId: CURATOR }] as unknown as Session[],
  } as ISessionRepository;

  const decisionRepo: IDecisionEventRepository = {
    findBySession: async () => decisions,
  } as IDecisionEventRepository;

  return new ScoringService(decisionRepo, sessionRepo);
}

async function scoreByItem(decisions: DecisionEvent[]) {
  const prefs = await buildService(decisions).computePreferences(
    COLLECTION,
    CURATOR,
  );
  return new Map(prefs.map((p) => [p.itemId, p]));
}

describe("ScoringService.computePreferences", () => {
  it("combines pairwise refinement with the triage base instead of discarding it", async () => {
    // Bug 1: with triage present, pairwise was overwritten and had zero effect.
    const byItem = await scoreByItem([
      triage("a", "high"), // base 0.75
      triage("b", "high"),
      pairwise("a", "b", "item_a"), // a wins: +0.1
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.85);
  });

  it("orders items within the same triage tier by their pairwise outcomes", async () => {
    // Bug 1 symptom: same-tier items tied and could not be ordered.
    const byItem = await scoreByItem([
      triage("a", "high"),
      triage("b", "high"),
      pairwise("a", "b", "item_a"), // a beats b
    ]);

    expect(byItem.get("a")!.score).toBeGreaterThan(byItem.get("b")!.score);
  });

  it("treats a skip as a no-op: no score penalty and no comparison counted", async () => {
    // Bug 2: skip fell into the loser branch for BOTH items and inflated count.
    const byItem = await scoreByItem([
      triage("a", "medium"), // base 0.5
      triage("b", "medium"),
      pairwise("a", "b", "skip"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.5);
    expect(byItem.get("b")!.score).toBeCloseTo(0.5);
    expect(byItem.get("a")!.comparisonCount).toBe(1); // triage only, skip not counted
    expect(byItem.get("b")!.comparisonCount).toBe(1);
  });

  it("does not let a skip erase an already-earned pairwise gain", async () => {
    // Integration of both fixes: combined score survives, skip adds nothing.
    const byItem = await scoreByItem([
      triage("a", "high"), // base 0.75
      triage("b", "low"),
      pairwise("a", "b", "item_a"), // a wins: +0.1 -> 0.85
      pairwise("a", "b", "skip"), // no-op
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.85);
    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + one real compare
  });

  it("scores a triage-only item by its tier (regression guard)", async () => {
    const byItem = await scoreByItem([triage("a", "top")]);

    expect(byItem.get("a")!.score).toBeCloseTo(1.0);
    expect(byItem.get("a")!.comparisonCount).toBe(1);
  });
});
