import { describe, expect, it } from "vitest";
import { ScoringService } from "./ScoringService";
import type {
  DecisionEvent,
  PairwiseResult,
  Session,
  TriageResult,
} from "@/types";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

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

// Triage with an explicit ordinal so latest-wins is deterministic: the event
// with the larger `seq` has the later createdAt (and a later-sorting id).
function triageAt(
  itemId: string,
  result: TriageResult,
  seq: number,
): DecisionEvent {
  return {
    id: `t-${itemId}-${String(seq).padStart(4, "0")}`,
    sessionId: SESSION,
    type: "triage",
    decision: { itemId, result },
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
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

function buildService(decisions: DecisionEvent[]): ScoringService {
  const sessionRepo: SessionRepository = {
    findByCollection: async () =>
      [{ id: SESSION, curatorId: CURATOR }] as unknown as Session[],
  } as unknown as SessionRepository;

  const decisionRepo: DecisionEventRepository = {
    findBySession: async () => decisions,
  } as unknown as DecisionEventRepository;

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
  it("round-trips each triage tier to its own bucket (purses-7lh)", async () => {
    const byItem = await scoreByItem([
      triage("love", "top"),
      triage("like", "high"),
      triage("maybe", "medium"),
      triage("release", "low"),
    ]);

    expect(byItem.get("love")!.score).toBeCloseTo(0.875);
    expect(byItem.get("love")!.rankBucket).toBe("top");
    expect(byItem.get("like")!.score).toBeCloseTo(0.625);
    expect(byItem.get("like")!.rankBucket).toBe("high");
    expect(byItem.get("maybe")!.score).toBeCloseTo(0.375);
    expect(byItem.get("maybe")!.rankBucket).toBe("medium");
    expect(byItem.get("release")!.score).toBeCloseTo(0.125);
    expect(byItem.get("release")!.rankBucket).toBe("low");
  });

  it("latest triage wins the bucket (high then top => top)", async () => {
    const byItem = await scoreByItem([
      triageAt("a", "high", 1), // seeds 0.625 first
      triageAt("a", "top", 2), // re-triaged higher: latest wins
    ]);

    expect(byItem.get("a")!.rankBucket).toBe("top");
    expect(byItem.get("a")!.score).toBeCloseTo(0.875);
  });

  it("latest triage wins even when the re-triage lowers the tier (top then low)", async () => {
    const byItem = await scoreByItem([
      triageAt("a", "top", 1), // seeds 0.875 first
      triageAt("a", "low", 2), // latest wins: down to Release
    ]);

    expect(byItem.get("a")!.rankBucket).toBe("low");
    expect(byItem.get("a")!.score).toBeCloseTo(0.125);
  });

  it("pairwise does not move score or bucket (loss after a top triage stays top)", async () => {
    const byItem = await scoreByItem([
      triage("a", "top"), // 0.875
      triage("b", "top"),
      pairwise("a", "b", "item_b"), // a loses — no longer moves score
    ]);

    // Both stay at their triage seed; ordering is now via orderRank + finalize
    // (Epic 0 Tasks 7/10), not an Elo delta on score.
    expect(byItem.get("a")!.score).toBeCloseTo(0.875);
    expect(byItem.get("a")!.rankBucket).toBe("top");
    expect(byItem.get("b")!.score).toBeCloseTo(0.875);
    expect(byItem.get("b")!.rankBucket).toBe("top");
  });

  it("same-tier items share a score after a pairwise, but the compare still counts", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "high"), // 0.625
      pairwise("a", "b", "item_a"), // winner no longer pulls ahead on score
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.625);
    expect(byItem.get("b")!.score).toBeCloseTo(0.625);
    expect(byItem.get("a")!.score).toBe(byItem.get("b")!.score);
    // The compare is still evidence: both items' comparisonCount incremented.
    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + win
    expect(byItem.get("b")!.comparisonCount).toBe(2); // triage + loss
  });

  it("leaves orderRank null (assigned later by binary insertion, Epic 0 Task 7)", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"),
      triage("b", "high"),
      pairwise("a", "b", "item_a"),
    ]);

    expect(byItem.get("a")!.orderRank).toBeNull();
    expect(byItem.get("b")!.orderRank).toBeNull();
  });

  it("treats a tie as no net swing that still counts as evidence", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "high"),
      pairwise("a", "b", "tie"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.625);
    expect(byItem.get("b")!.score).toBeCloseTo(0.625);
    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + tie
    expect(byItem.get("b")!.comparisonCount).toBe(2);
  });

  it("treats a skip as a complete no-op", async () => {
    const byItem = await scoreByItem([
      triage("a", "medium"), // 0.375
      triage("b", "medium"),
      pairwise("a", "b", "skip"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.375);
    expect(byItem.get("b")!.score).toBeCloseTo(0.375);
    expect(byItem.get("a")!.comparisonCount).toBe(1); // skip not counted
    expect(byItem.get("b")!.comparisonCount).toBe(1);
  });

  it("counts ties but not skips toward confidence", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"),
      triage("b", "high"),
      pairwise("a", "b", "tie"),
      pairwise("a", "b", "skip"),
    ]);

    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + tie only
    expect(byItem.get("a")!.confidence).toBeCloseTo(0.2);
  });

  it("defaults an un-triaged item compared in pairwise to the Maybe center", async () => {
    const byItem = await scoreByItem([pairwise("a", "b", "tie")]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.375);
    expect(byItem.get("a")!.rankBucket).toBe("medium");
    expect(byItem.get("a")!.comparisonCount).toBe(1);
  });
});
