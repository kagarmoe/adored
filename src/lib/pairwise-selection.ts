import type { CollectionPreferenceItem, Disposition, Item } from "@/types";

interface SelectionOptions {
  preferences: CollectionPreferenceItem[];
  items: Item[];
  decidedPairs: Set<string>;
  /**
   * Items the curator has disposed (set_aside / deferred). A disposed item is
   * never offered as a pairing candidate — it has no preference row, so the
   * score-sort below would otherwise score it `?? 0` and treat it as eligible.
   * Optional + defaults to empty: existing callers are unaffected.
   */
  dispositionByItemId?: Map<string, Disposition>;
}

/**
 * Smart pair selection for pairwise comparisons
 * Prioritizes items that are close in score to create meaningful decisions
 */
export function selectNextPair(options: SelectionOptions): [Item, Item] | null {
  const { preferences, items, decidedPairs } = options;

  const disposed = options.dispositionByItemId ?? new Map<string, Disposition>();
  const eligible = items.filter((i) => !disposed.has(i.id));

  const prefMap = new Map(preferences.map((p) => [p.itemId, p]));

  // Sort items by score (descending)
  const sorted = [...eligible].sort((a, b) => {
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
