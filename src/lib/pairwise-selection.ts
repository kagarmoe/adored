import type { CollectionPreferenceItem, DecisionEvent, Item } from "@/types";
import { deriveOrder, toComparisonEvents, type RankItem } from "@/lib/insertion-ranking";
import { selectComparableItems } from "@/lib/compare-selection";

interface SelectionOptions {
  preferences: CollectionPreferenceItem[];
  items: Item[];
  /** The curator's decision log; only pairwise events feed the engine. */
  decisions: DecisionEvent[];
}

/**
 * The live "which pair next" selector: the same binary-insertion engine the
 * recompute runs, over the same comparable set (Love + Like), so both ask the
 * same next question. Null when the comparable set is fully ordered.
 */
export function selectNextPair({ preferences, items, decisions }: SelectionOptions): [Item, Item] | null {
  const comparable = selectComparableItems(items, preferences);
  const rankItems: RankItem[] = comparable.map((i) => ({ id: i.id, createdAt: i.createdAt }));
  const { nextPair } = deriveOrder(rankItems, toComparisonEvents(decisions));
  if (nextPair === null) return null;
  const byId = new Map(comparable.map((i) => [i.id, i]));
  const x = byId.get(nextPair[0]);
  const pivot = byId.get(nextPair[1]);
  return x && pivot ? [x, pivot] : null;
}
