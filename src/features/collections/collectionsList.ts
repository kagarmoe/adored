import type { Collection } from "@/types";
import { itemsViewHref } from "@/features/items/ItemFilterPills";

export type CollectionsView = "all" | "archived";
export const COLLECTION_PILLS: [CollectionsView, string][] = [["all", "All"], ["archived", "Archived"]];

/** `?status=archived` is the only non-default view; the retired "active" and anything else is All. */
export function collectionsViewFrom(status: unknown): CollectionsView {
  return status === "archived" ? "archived" : "all";
}

export const collectionsViewHref = (view: CollectionsView, q: string) => itemsViewHref("/collections", view, q);

/** All = not archived (no status is silently hidden), Archived = archived; plain-text
 *  search (never a pattern) over name and description. */
export function filterCollections(
  collections: Collection[],
  opts: { view: CollectionsView; q: string },
): Collection[] {
  const wantArchived = opts.view === "archived";
  const needle = opts.q.trim().toLocaleLowerCase();
  return collections.filter(
    (c) =>
      (c.status === "archived") === wantArchived &&
      (!needle || [c.name, c.description].some((text) => text?.toLocaleLowerCase().includes(needle))),
  );
}

export function collectionsEmptyState(opts: { hasAny: boolean; view: CollectionsView; q: string }) {
  const q = opts.q.trim();
  if (q) return { heading: `Nothing matches “${q}”`, message: "Try another word, or clear the search." };
  if (opts.view === "archived")
    return { heading: "Nothing archived", message: "Collections you archive rest here, ready to come back whenever you like." };
  if (!opts.hasAny)
    return { heading: "Nothing here yet", message: "Start a new collection whenever you’re ready — there’s no rush." };
  return { heading: "Nothing here right now", message: "Your archived collections are under Archived." };
}
