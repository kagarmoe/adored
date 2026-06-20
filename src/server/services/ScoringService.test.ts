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

function buildService(decisions: DecisionEvent[]): ScoringService {
  const sessionRepo: ISessionRepository = {
    findByCollection: async () =>
      [{ id: SESSION, curatorId: CURATOR }] as unknown as Session[],
  } as unknown as ISessionRepository;

  const decisionRepo: IDecisionEventRepository = {
    findBySession: async () => decisions,
  } as unknown as IDecisionEventRepository;

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

  it("promotes across a tier boundary after two consistent wins", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "high"),
      pairwise("a", "b", "item_a"),
      pairwise("a", "b", "item_a"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.825);
    expect(byItem.get("a")!.rankBucket).toBe("top"); // Like -> Love
  });

  it("stays in tier after only two losses (needs three to demote)", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.525);
    expect(byItem.get("a")!.rankBucket).toBe("high"); // still Like
  });

  it("demotes across a tier boundary after three consistent losses", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.475);
    expect(byItem.get("a")!.rankBucket).toBe("medium"); // Like -> Maybe
  });

  it("rescues a Release item up into favorites (symmetric override)", async () => {
    const byItem = await scoreByItem([
      triage("a", "low"), // 0.125 (Release)
      triage("b", "low"),
      pairwise("a", "b", "item_a"),
      pairwise("a", "b", "item_a"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.325);
    expect(byItem.get("a")!.rankBucket).toBe("medium"); // out of Release
  });

  it("demotes a favorite into Release on sustained losses (symmetric override)", async () => {
    const byItem = await scoreByItem([
      triage("a", "medium"), // 0.375 (Maybe, a favorite)
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.225);
    expect(byItem.get("a")!.rankBucket).toBe("low"); // Maybe -> Release
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
