import { FilterPills } from "@/components/ui";
import { viewHref } from "@/components/ui/viewHref";

export type ItemsView = "all" | "archived" | "unnamed";
const PILLS: [ItemsView, string][] = [["all", "All"], ["archived", "Archived"], ["unnamed", "Waiting for a name"]];

/** `path` is the list's own path (the collection home since PR 3). */
export function ItemFilterPills({ path, view, q }: { path: string; view: ItemsView; q: string }) {
  return (
    <FilterPills
      label="Filter items"
      pills={PILLS.map(([v, label]) => ({ label, href: viewHref(path, v, q), current: v === view }))}
    />
  );
}
