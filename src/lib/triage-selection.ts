import type { Item, Disposition } from "@/types";

export interface TriageQueueEntry {
  item: Item;
  deferred: boolean;
}

// The whole eligible remainder for the feelings phase — untriaged, not set_aside;
// active items first, then deferred, each in today's input ordering. NO count
// parameter: every live piece passes through once (spec §4).
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
