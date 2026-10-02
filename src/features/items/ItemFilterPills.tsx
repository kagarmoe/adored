import { FilterPills } from "@/components/ui";

export type ItemsView = "all" | "archived" | "unnamed";
const PILLS: [ItemsView, string][] = [["all", "All"], ["archived", "Archived"], ["unnamed", "Waiting for a name"]];

/** `path` is the list's own path (the collection home since PR 3). */
export function itemsViewHref(path: string, view: ItemsView, q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (view === "unnamed") p.set("unnamed", "1");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

export function ItemFilterPills({ path, view, q }: { path: string; view: ItemsView; q: string }) {
  return (
    <FilterPills
      label="Filter items"
      pills={PILLS.map(([v, label]) => ({ label, href: itemsViewHref(path, v, q), current: v === view }))}
    />
  );
}
