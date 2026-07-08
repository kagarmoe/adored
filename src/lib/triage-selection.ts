import type { Item, Disposition } from "@/types";

export interface TriageQueueEntry {
  item: Item;
  deferred: boolean;
}

// The whole eligible remainder for a triage round — untriaged, not set_aside;
// active items first, then deferred, each in today's input ordering. NO count
// parameter: rounds are time-boxed, never count-boxed (spec §3.3/F6).
export function selectTriageQueue(
  items: Item[],
  preferenceItemIds: Set<string>,
  dispositionByItemId: Map<string, Disposition>,
): TriageQueueEntry[] {
  const candidates = items.filter(
    (i) => !preferenceItemIds.has(i.id) && dispositionByItemId.get(i.id) !== "set_aside",
  );
  const active = candidates.filter((i) => dispositionByItemId.get(i.id) !== "deferred");
  const deferred = candidates.filter((i) => dispositionByItemId.get(i.id) === "deferred");
  return [
    ...active.map((item) => ({ item, deferred: false })),
    ...deferred.map((item) => ({ item, deferred: true })),
  ];
}

// First entry of selectTriageQueue — BY CONSTRUCTION, so next-round.ts and the
// round page can never disagree about what comes forward next (F6). The old
// `showingDeferred` semantics (active exhausted, deferred remain) hold exactly
// when the queue's head entry is deferred.
export function selectTriageItem(
  items: Item[],
  preferenceItemIds: Set<string>,
  dispositionByItemId: Map<string, Disposition>,
): { item: Item | null; showingDeferred: boolean } {
  const first = selectTriageQueue(items, preferenceItemIds, dispositionByItemId)[0];
  return { item: first?.item ?? null, showingDeferred: first?.deferred ?? false };
}
