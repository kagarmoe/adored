import type { CollectionPreferenceItem, Item } from "@/types";

interface SelectionOptions {
  preferences: CollectionPreferenceItem[];
  items: Item[];
  decidedPairs: Set<string>;
}

/**
 * Smart pair selection for pairwise comparisons
 * Prioritizes items that are close in score to create meaningful decisions
 */
export function selectNextPair(options: SelectionOptions): [Item, Item] | null {
  const { preferences, items, decidedPairs } = options;

  const prefMap = new Map(preferences.map((p) => [p.itemId, p]));

  // Sort items by score (descending)
  const sorted = [...items].sort((a, b) => {
    const scoreA = prefMap.get(a.id)?.score ?? 0;
    const scoreB = prefMap.get(b.id)?.score ?? 0;
    return scoreB - scoreA;
  });

  // Find first pair that hasn't been decided yet
  // Prioritize adjacent items in ranking (closest scores)
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 5, sorted.length); j++) {
      const itemA = sorted[i];
      const itemB = sorted[j];

      const pairKey1 = `${itemA.id}-${itemB.id}`;
      const pairKey2 = `${itemB.id}-${itemA.id}`;

      if (!decidedPairs.has(pairKey1) && !decidedPairs.has(pairKey2)) {
        return [itemA, itemB];
      }
    }
  }

  // All meaningful pairs have been decided
  return null;
}

/**
 * Get pairs that need more comparison (low confidence items)
 */
export function getLowConfidencePairs(preferences: CollectionPreferenceItem[]): string[] {
  // Items with confidence < 0.7 need more comparison
  return preferences
    .filter((p) => p.confidence < 0.7)
    .sort((a, b) => a.confidence - b.confidence)
    .map((p) => p.itemId);
}

/**
 * Get comparison priorities based on confidence and score proximity
 */
export function getComparisonPriorities(
  preferences: CollectionPreferenceItem[]
): { itemId: string; priority: number }[] {
  return preferences
    .map((p) => ({
      itemId: p.itemId,
      priority: (1 - p.confidence) * Math.max(1, p.comparisonCount),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
}
