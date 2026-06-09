import type {
  CollectionPreferenceItem,
  DecisionEvent,
  PairwiseDecision,
  TriageDecision,
} from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

// Triage seeds each item at the CENTER of its tier band, so triage -> getBucket
// is an identity round-trip and every item has +/-0.125 of headroom for pairwise
// refinement to move it within, or across, a tier boundary.
const TIER_SEED = {
  top: 0.875,
  high: 0.625,
  medium: 0.375,
  low: 0.125,
} as const;

const WIN_DELTA = 0.1;
const LOSS_DELTA = 0.05;

// Defensive only: an item compared without ever being triaged cannot happen in
// the real flow (the whole collection is triaged before comparison). Seed such
// an item at the neutral Maybe center.
const UNTRIAGED_DEFAULT = TIER_SEED.medium;

type ItemState = { score: number; count: number };

export class ScoringService {
  constructor(
    private decisionRepo: IDecisionEventRepository,
    private sessionRepo: ISessionRepository,
  ) {}

  private scoreFromTriageEvent(
    result: "top" | "high" | "medium" | "low",
  ): number {
    return TIER_SEED[result];
  }

  private clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private calculateConfidence(comparisonCount: number): number {
    return Math.min(1.0, comparisonCount / 10);
  }

  private getBucket(score: number): "top" | "high" | "medium" | "low" {
    if (score >= 0.75) return "top";
    if (score >= 0.5) return "high";
    if (score >= 0.25) return "medium";
    return "low";
  }

  async computePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    const sessions = await this.sessionRepo.findByCollection(collectionId);
    const curatorSessions = sessions.filter((s) => s.curatorId === curatorId);

    const allDecisions: DecisionEvent[] = [];
    for (const session of curatorSessions) {
      const decisions = await this.decisionRepo.findBySession(session.id);
      allDecisions.push(...decisions);
    }

    const itemState = new Map<string, ItemState>();
    const ensure = (itemId: string): ItemState => {
      let state = itemState.get(itemId);
      if (!state) {
        state = { score: UNTRIAGED_DEFAULT, count: 0 };
        itemState.set(itemId, state);
      }
      return state;
    };

    // Pass 1: triage seeds the base score at its tier center.
    for (const decision of allDecisions) {
      if (decision.type !== "triage") continue;
      const { itemId, result } = decision.decision as TriageDecision;
      const state = ensure(itemId);
      state.score = this.scoreFromTriageEvent(result);
      state.count++;
    }

    // Pass 2: pairwise refines the seeded score. Skip is a no-op; tie counts as
    // evidence with no net swing; win/loss move the score and may cross a tier
    // boundary once accumulated deltas exceed the 0.125 headroom.
    for (const decision of allDecisions) {
      if (decision.type !== "pairwise_compare") continue;
      const { itemAId, itemBId, result } =
        decision.decision as PairwiseDecision;

      if (result === "skip") continue;

      const aState = ensure(itemAId);
      const bState = ensure(itemBId);

      if (result === "tie") {
        aState.count++;
        bState.count++;
        continue;
      }

      const [winner, loser] =
        result === "item_a" ? [aState, bState] : [bState, aState];
      winner.score = this.clamp01(winner.score + WIN_DELTA);
      loser.score = this.clamp01(loser.score - LOSS_DELTA);
      aState.count++;
      bState.count++;
    }

    const preferences: CollectionPreferenceItem[] = [];
    for (const [itemId, data] of itemState) {
      if (data.count === 0) continue;
      preferences.push({
        id: `${collectionId}-${curatorId}-${itemId}`,
        collectionId,
        curatorId,
        itemId,
        score: data.score,
        confidence: this.calculateConfidence(data.count),
        rankBucket: this.getBucket(data.score),
        comparisonCount: data.count,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return preferences;
  }
}
