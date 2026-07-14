import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import {
  deriveOrder,
  toComparisonEvents,
  type RankItem,
} from "@/lib/insertion-ranking";
import { selectComparableItems } from "@/lib/compare-selection";

interface SelectionOptions {
  preferences: CollectionPreferenceItem[];
  items: Item[];
  /**
   * The session's decision events (pairwise + triage). The pairwise ones are mapped
   * to the engine's ComparisonEvent[] via the SAME shared mapping recompute uses.
   */
  decisions: DecisionEvent[];
  /**
   * Items the curator has disposed (set_aside / deferred). A disposed item is
   * excluded from the comparable set before deriveOrder, so it is never offered
   * as a pairing candidate. Optional + defaults to empty: existing callers are
   * unaffected.
   */
  dispositionByItemId?: Map<string, Disposition>;
}

/**
 * The live "which pair to compare next" selector. Delegates to the pure binary-insertion
 * engine (deriveOrder) — the same engine recompute runs — so the Sort round and any other
 * entry point agree on the next question. Returns the two items the page renders, or null
 * when the comparable set is fully ordered.
 */
export function selectNextPair(options: SelectionOptions): [Item, Item] | null {
  const { items, decisions } = options;
  const disposed = options.dispositionByItemId ?? new Map<string, Disposition>();

  const itemById = new Map(items.map((i) => [i.id, i]));

  // RankItem[] from each comparable item's OWN createdAt (drives the engine's
  // deterministic canonical insertion sequence) — identical to recompute.
  const rankItems: RankItem[] = selectComparableItems(items, disposed)
    .map((i) => ({ id: i.id, createdAt: i.createdAt }));

  const comparisons = toComparisonEvents(decisions);
  const { nextPair } = deriveOrder(rankItems, comparisons);
  if (nextPair === null) return null;

  const [xId, pivotId] = nextPair;
  const itemX = itemById.get(xId);
  const itemPivot = itemById.get(pivotId);
  // Both ids come from the comparable set, which is derived from `items`, so both
  // lookups resolve; the guard keeps the return type honest.
  if (!itemX || !itemPivot) return null;
  return [itemX, itemPivot];
}
