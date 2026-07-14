import type { Disposition, Item } from "@/types";

export function selectComparableItems(
  items: Item[],
  dispositionByItemId: ReadonlyMap<string, Disposition>,
): Item[] {
  return items.filter(
    (item) => item.deletedAt === null && dispositionByItemId.get(item.id) === undefined,
  );
}
