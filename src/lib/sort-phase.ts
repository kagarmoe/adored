import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import { selectTriageQueue, type TriageQueueEntry } from "@/lib/triage-selection";
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

  // The same insertion engine and comparable set (Love + Like) the recompute
  // runs, so the screen asks the question the stored order is waiting on.
  const comparable = selectComparableItems(items, preferences);
  const byId = new Map(comparable.map((i) => [i.id, i]));
  const { order, nextPair } = deriveOrder(
    comparable.map((i) => ({ id: i.id, createdAt: i.createdAt })),
    toComparisonEvents(curatorDecisions),
  );
  const x = nextPair && byId.get(nextPair[0]);
  const pivot = nextPair && byId.get(nextPair[1]);
  return x && pivot
    ? { kind: "pairs", pair: [x, pivot], progress: { done: order.length, total: comparable.length } }
    : { kind: "done", progress: { done: comparable.length, total: comparable.length } };
}
