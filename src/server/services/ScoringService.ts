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

  private calculateConfidence(comparisonCount: number): number {
    return Math.min(1.0, comparisonCount / 10);
  }

  private getBucket(score: number): "top" | "high" | "medium" | "low" {
    if (score >= 0.75) return "top";
    if (score >= 0.5) return "high";
    if (score >= 0.25) return "medium";
    return "low";
  }

  // The curator's non-deleted sessions across the collection, each session's
  // decision events flattened. Fetched in parallel (one query per session, all
  // in flight at once). recalculatePreferences reads this ONCE and shares the
  // same list with the comparison mapping, so the decision log isn't read twice.
  async loadCuratorDecisionEvents(
    collectionId: string,
    curatorId: string,
  ): Promise<DecisionEvent[]> {
    const sessions = await this.sessionRepo.findByCollection(collectionId);
    const curatorSessions = sessions.filter((s) => s.curatorId === curatorId);
    const perSession = await Promise.all(
      curatorSessions.map((s) => this.decisionRepo.findBySession(s.id)),
    );
    return perSession.flat();
  }

  // `events` lets the caller supply an already-fetched decision log (see
  // loadCuratorDecisionEvents), avoiding a second read of the same events. When
  // omitted, they're fetched here — the standalone contract is unchanged.
  async computePreferences(
    collectionId: string,
    curatorId: string,
    events?: DecisionEvent[],
  ): Promise<CollectionPreferenceItem[]> {
    const allDecisions =
      events ?? (await this.loadCuratorDecisionEvents(collectionId, curatorId));

    const itemState = new Map<string, ItemState>();
    const ensure = (itemId: string): ItemState => {
      let state = itemState.get(itemId);
      if (!state) {
        state = { score: UNTRIAGED_DEFAULT, count: 0 };
        itemState.set(itemId, state);
      }
      return state;
    };

    // Chronological order so the LAST triage per item wins its bucket. Ties on
    // createdAt fall back to id for a stable, deterministic order.
    const ordered = [...allDecisions].sort((a, b) => {
      const byTime = a.createdAt.getTime() - b.createdAt.getTime();
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });

    // Pass 1: triage seeds the score at its tier center — latest triage wins.
    for (const decision of ordered) {
      if (decision.type !== "triage") continue;
      const { itemId, result } = decision.decision as TriageDecision;
      const state = ensure(itemId);
      state.score = this.scoreFromTriageEvent(result);
      state.count++;
    }

    // Pass 2: pairwise no longer moves score — end-to-end ranking order is now
    // via orderRank + finalize (Epic 0 Tasks 7/10). We keep counting comparisons
    // as evidence for confidence: win/loss/tie increment both items; skip is a
    // no-op.
    for (const decision of ordered) {
      if (decision.type !== "pairwise_compare") continue;
      const { itemAId, itemBId, result } =
        decision.decision as PairwiseDecision;

      if (result === "skip") continue;

      ensure(itemAId).count++;
      ensure(itemBId).count++;
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
        orderRank: null,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return preferences;
  }
}
