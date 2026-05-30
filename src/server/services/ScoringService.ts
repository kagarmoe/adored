import type { CollectionPreferenceItem } from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

export class ScoringService {
  constructor(
    private decisionRepo: IDecisionEventRepository,
    private preferenceRepo: ICollectionPreferenceItemRepository,
    private sessionRepo: ISessionRepository,
  ) {}

  private scoreFromTriageEvent(result: "top" | "high" | "medium" | "low"): number {
    const scores = { top: 1.0, high: 0.75, medium: 0.5, low: 0.25 };
    return scores[result];
  }

  private scoreFromPairwiseEvent(
    currentScore: number,
    isWinner: boolean,
  ): number {
    if (isWinner) {
      return currentScore + 0.1;
    }
    return Math.max(0, currentScore - 0.05);
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

  async computeItemPreference(
    itemId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem | null> {
    const existingPref = await this.preferenceRepo.findByItem(itemId, curatorId);
    let score = existingPref?.score ?? 0;
    let comparisonCount = existingPref?.comparisonCount ?? 0;

    const decisions = await this.decisionRepo.findBySession(itemId);

    for (const decision of decisions) {
      if (decision.type === "triage") {
        const triageDecision = decision.decision as {
          itemId: string;
          result: "top" | "high" | "medium" | "low";
        };
        if (triageDecision.itemId === itemId) {
          score =
            (score * comparisonCount +
              this.scoreFromTriageEvent(triageDecision.result)) /
            (comparisonCount + 1);
          comparisonCount++;
        }
      } else if (decision.type === "pairwise_compare") {
        const pairwiseDecision = decision.decision as {
          itemAId: string;
          itemBId: string;
          result: "item_a" | "item_b" | "tie" | "skip";
        };
        if (pairwiseDecision.itemAId === itemId) {
          const isWinner =
            pairwiseDecision.result === "item_a" ||
            pairwiseDecision.result === "tie";
          score = this.scoreFromPairwiseEvent(score, isWinner);
          comparisonCount++;
        } else if (pairwiseDecision.itemBId === itemId) {
          const isWinner =
            pairwiseDecision.result === "item_b" ||
            pairwiseDecision.result === "tie";
          score = this.scoreFromPairwiseEvent(score, isWinner);
          comparisonCount++;
        }
      }
    }

    if (comparisonCount === 0) return null;

    const confidence = this.calculateConfidence(comparisonCount);
    const bucket = this.getBucket(score);

    if (existingPref) {
      return this.preferenceRepo.update(existingPref.id, {
        score,
        confidence,
        rankBucket: bucket,
        comparisonCount,
        lastSeen: new Date(),
        updatedAt: new Date(),
      });
    }

    return null;
  }

  async computePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    const sessions = await this.sessionRepo.findByCollection(collectionId);
    const curatorSessions = sessions.filter((s) => s.curatorId === curatorId);

    const itemScores = new Map<
      string,
      { score: number; count: number; triageCount: number }
    >();

    for (const session of curatorSessions) {
      const decisions = await this.decisionRepo.findBySession(session.id);

      for (const decision of decisions) {
        if (decision.type === "triage") {
          const triageDecision = decision.decision as {
            itemId: string;
            result: "top" | "high" | "medium" | "low";
          };
          const itemId = triageDecision.itemId;
          const current = itemScores.get(itemId) || {
            score: 0,
            count: 0,
            triageCount: 0,
          };
          current.score =
            (current.score * current.count +
              this.scoreFromTriageEvent(triageDecision.result)) /
            (current.count + 1);
          current.count++;
          current.triageCount++;
          itemScores.set(itemId, current);
        } else if (decision.type === "pairwise_compare") {
          const pairwiseDecision = decision.decision as {
            itemAId: string;
            itemBId: string;
            result: "item_a" | "item_b" | "tie" | "skip";
          };

          const itemAData = itemScores.get(pairwiseDecision.itemAId) || {
            score: 0,
            count: 0,
            triageCount: 0,
          };
          const itemBData = itemScores.get(pairwiseDecision.itemBId) || {
            score: 0,
            count: 0,
            triageCount: 0,
          };

          if (
            pairwiseDecision.result === "item_a" ||
            pairwiseDecision.result === "tie"
          ) {
            itemAData.score = this.scoreFromPairwiseEvent(itemAData.score, true);
          } else {
            itemAData.score = this.scoreFromPairwiseEvent(
              itemAData.score,
              false,
            );
          }
          itemAData.count++;

          if (
            pairwiseDecision.result === "item_b" ||
            pairwiseDecision.result === "tie"
          ) {
            itemBData.score = this.scoreFromPairwiseEvent(itemBData.score, true);
          } else {
            itemBData.score = this.scoreFromPairwiseEvent(
              itemBData.score,
              false,
            );
          }
          itemBData.count++;

          itemScores.set(pairwiseDecision.itemAId, itemAData);
          itemScores.set(pairwiseDecision.itemBId, itemBData);
        }
      }
    }

    const preferences: CollectionPreferenceItem[] = [];
    for (const [itemId, data] of itemScores) {
      if (data.count > 0) {
        const confidence = this.calculateConfidence(data.count);
        const bucket = this.getBucket(data.score);
        preferences.push({
          id: `${collectionId}-${curatorId}-${itemId}`,
          collectionId,
          curatorId,
          itemId,
          score: data.score,
          confidence,
          rankBucket: bucket,
          comparisonCount: data.count,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return preferences;
  }
}
