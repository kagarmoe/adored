import type { Item, Disposition } from "@/types";

export function selectTriageItem(
  items: Item[],
  preferenceItemIds: Set<string>,
  dispositionByItemId: Map<string, Disposition>,
): { item: Item | null; showingDeferred: boolean } {
  const untriaged = items.filter((i) => !preferenceItemIds.has(i.id));
  const candidates = untriaged.filter((i) => dispositionByItemId.get(i.id) !== "set_aside");
  const active = candidates.filter((i) => dispositionByItemId.get(i.id) !== "deferred");
  const deferred = candidates.filter((i) => dispositionByItemId.get(i.id) === "deferred");
  const item = active[0] ?? deferred[0] ?? null;
  return { item, showingDeferred: active.length === 0 && deferred.length > 0 };
}
