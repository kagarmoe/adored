import type { Item, CollectionPreferenceItem } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";

export interface PairingResult {
  itemA: Item;
  itemB: Item;
}

export class PairingService {
  constructor(
    private itemRepo: IItemRepository,
    private preferenceRepo: ICollectionPreferenceItemRepository,
  ) {}

  private getGoalBias(
    goal: string | null,
    item: Item,
    prefs: CollectionPreferenceItem[],
  ): number {
    if (!goal) return 0;

    const itemPref = prefs.find((p) => p.itemId === item.id);
    if (!itemPref) return 0;

    if (goal.toLowerCase().includes("favorites") && itemPref.rankBucket === "top") {
      return 0.5;
    }
    if (goal.toLowerCase().includes("refine") && itemPref.rankBucket === "high") {
      return 0.3;
    }
    if (goal.toLowerCase().includes("triage") && itemPref.rankBucket === "low") {
      return 0.4;
    }

    return 0;
  }

  private calculatePairingScore(
    item: Item,
    prefs: CollectionPreferenceItem[],
    goal: string | null,
  ): number {
    const itemPref = prefs.find((p) => p.itemId === item.id);

    let score = 0;

    if (itemPref) {
      if (itemPref.comparisonCount < 5) {
        score += 1.0;
      } else if (itemPref.comparisonCount < 10) {
        score += 0.5;
      }

      if (itemPref.confidence < 0.7) {
        score += 0.5;
      }

      score += this.getGoalBias(goal, item, prefs);
    } else {
      score = 1.0;
    }

    return score;
  }

  async selectNextPair(
    collectionId: string,
    curatorId: string,
    goal: string | null = null,
  ): Promise<PairingResult | null> {
    const items = await this.itemRepo.findByCollection(collectionId);
    if (items.length < 2) return null;

    const prefs = await this.preferenceRepo.findByCollection(collectionId, curatorId);

    const itemsByScore = items
      .map((item) => ({
        item,
        score: this.calculatePairingScore(item, prefs, goal),
      }))
      .sort((a, b) => b.score - a.score);

    if (itemsByScore.length < 2) return null;

    const itemA = itemsByScore[0].item;
    const itemB = itemsByScore[1].item;

    return { itemA, itemB };
  }

  async prioritizeByGoal(
    items: Item[],
    goal: string | null = null,
  ): Promise<Item[]> {
    if (!goal) return items;

    const goalLower = goal.toLowerCase();

    return items.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      if (goalLower.includes("favorites")) {
        scoreA = a.status === "favorite" ? 1 : 0;
        scoreB = b.status === "favorite" ? 1 : 0;
      } else if (goalLower.includes("refine")) {
        const hasNotes = (s: string | null) => s && s.length > 0 ? 0.5 : 0;
        scoreA = hasNotes(a.notes);
        scoreB = hasNotes(b.notes);
      } else if (goalLower.includes("triage")) {
        scoreA = a.brand && a.style ? 1 : 0;
        scoreB = b.brand && b.style ? 1 : 0;
      }

      return scoreB - scoreA;
    });
  }
}
