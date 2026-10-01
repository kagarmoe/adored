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

const SEARCHABLE = ["name", "brand", "style", "color", "material", "category"] as const;

/** Grid filter: plain-text search (substring, case-insensitive — never a pattern)
 *  and the "Waiting for a name" view. `#N` matches an item's catalog number. */
export function filterItems(items: Item[], opts: { unnamed: boolean; q: string }): Item[] {
  const needle = opts.q.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (opts.unnamed && hasName(item)) return false;
    if (!needle) return true;
    return (
      SEARCHABLE.some((k) => item[k]?.toLocaleLowerCase().includes(needle)) ||
      (item.number != null && `#${item.number}` === needle)
    );
  });
}

/** Heading + message for the items grid's empty states. Kept pure + tested so
 *  the gentle, no-shame copy can't silently regress (TONE: never count what's
 *  missing, no "incomplete"/"need" framing). */
export function itemsEmptyState(opts: {
  hasAnyItems: boolean;
  view: "all" | "archived" | "unnamed";
  q: string;
}): { heading: string; message: string } {
  const q = opts.q.trim();
  if (q) return { heading: `Nothing matches “${q}”`, message: "Try another word, or clear the search." };
  if (opts.view === "archived") {
    return { heading: "Nothing archived", message: "Archived items rest here, ready to come back whenever you like." };
  }
  if (opts.view === "unnamed") {
    return { heading: "Everything has a name", message: "Nothing is waiting — name things whenever you like." };
  }
  if (!opts.hasAnyItems) return { heading: "No items yet", message: "Add photos to start your collection." };
  return { heading: "No items here", message: "Try a different filter." };
}
