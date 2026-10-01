import type { Item } from "@/types";

type NameableItem = { name: string | null; number: number | null };

/** True when an item has a non-blank name. The one definition of "named" —
 *  display, filter, and the "add a name" cues all agree (a whitespace-only
 *  name counts as nameless). */
export function hasName(item: { name: string | null }): boolean {
  return !!item.name?.trim();
}

/** Human label for an item: its name, else its catalog number (#N), else "Untitled". */
export function itemDisplayName(item: NameableItem): string {
  if (hasName(item)) {
    return item.name!.trim();
  }
  return item.number != null ? `#${item.number}` : "Untitled";
}

/** "#14 · added in June" — the year appears only when it isn't the current one. */
export function itemSubtitle(item: { number: number | null; createdAt: Date }, now: Date): string {
  const d = new Date(item.createdAt);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const when = d.getUTCFullYear() === now.getUTCFullYear() ? month : `${month} ${d.getUTCFullYear()}`;
  return `${item.number != null ? `#${item.number} · ` : ""}added in ${when}`;
}

/** Single-glyph avatar for an item with no photo: name initial, else a neutral mark. */
export function itemInitial(item: NameableItem): string {
  return hasName(item) ? item.name!.trim().charAt(0).toUpperCase() : "•";
}

/** In-page filter for the items grid: by status (all|active|archived|deleted)
 *  and, when unnamed is on, only items that have no name yet. */
export function filterItems(
  items: Item[],
  opts: { status: string; unnamed: boolean },
): Item[] {
  return items.filter((item) => {
    if (opts.status !== "all" && (item.status || "active") !== opts.status) return false;
    if (opts.unnamed && hasName(item)) return false;
    return true;
  });
}

/** Heading + message for the items grid's empty states. Kept pure + tested so
 *  the gentle, no-shame copy can't silently regress (TONE: no "incomplete"/
 *  "missing"/"need" framing). */
export function itemsEmptyState(opts: {
  hasAnyItems: boolean;
  unnamed: boolean;
  status: string;
}): { heading: string; message: string } {
  if (!opts.hasAnyItems) {
    return {
      heading: "No items yet",
      message: "Add items to start organizing your collection",
    };
  }
  if (opts.unnamed) {
    return {
      heading: "Everything has a name",
      message: "Nothing is waiting — name things whenever you like.",
    };
  }
  return { heading: `No ${opts.status} items`, message: "Try a different status filter" };
}
