import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import { selectTriageQueue, type TriageQueueEntry } from "@/lib/triage-selection";
import { selectNextPair } from "@/lib/pairwise-selection";
import { selectComparableItems } from "@/lib/compare-selection";
import { deriveOrder, toComparisonEvents } from "@/lib/insertion-ranking";

export interface SortProgressCount {
  done: number;
  total: number;
}

export type SortPhase =
  | { kind: "feelings"; queue: TriageQueueEntry[]; progress: SortProgressCount }
  | { kind: "pairs"; pair: [Item, Item]; progress: SortProgressCount }
  | { kind: "done"; progress: SortProgressCount };

export interface SortPhaseInput {
  /** The collection's live items. */
  items: Item[];
  preferences: CollectionPreferenceItem[];
  dispositionByItemId: Map<string, Disposition>;
  /** The curator's cross-session decision log (the one the recompute reads). */
  curatorDecisions: DecisionEvent[];
  /** This visit already walked the Not yet tail (the feelings phase handed off). */
  deferredOffered: boolean;
}

/**
 * Which phase the Sort screen shows (spec §4). Feelings first: every live piece
 * passes through once, Not yet pieces at the end; Not mine pieces never. Then
 * pairs over Love + Like. Progress never counts Not yet or Not mine pieces.
 */
export function chooseSortPhase(input: SortPhaseInput): SortPhase {
  const { items, preferences, dispositionByItemId, curatorDecisions, deferredOffered } = input;
  const liveIds = new Set(items.map((i) => i.id));
  const placed = new Set(preferences.filter((p) => liveIds.has(p.itemId)).map((p) => p.itemId));
  const queue = selectTriageQueue(items, placed, dispositionByItemId);
  const active = queue.filter((e) => !e.deferred).length;
  if (active > 0 || (queue.length > 0 && !deferredOffered)) {
    return { kind: "feelings", queue, progress: { done: placed.size, total: placed.size + active } };
  }

  const comparable = selectComparableItems(items, preferences);
  const { order } = deriveOrder(
    comparable.map((i) => ({ id: i.id, createdAt: i.createdAt })),
    toComparisonEvents(curatorDecisions),
  );
  const pair = selectNextPair({ preferences, items, decisions: curatorDecisions });
  return pair
    ? { kind: "pairs", pair, progress: { done: order.length, total: comparable.length } }
    : { kind: "done", progress: { done: comparable.length, total: comparable.length } };
}
