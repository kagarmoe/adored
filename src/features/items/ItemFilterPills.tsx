import Link from "next/link";
import { CheckIcon } from "./InYourLifeChip";

export type ItemsView = "all" | "archived" | "unnamed";

const PILLS: [ItemsView, string][] = [
  ["all", "All"],
  ["archived", "Archived"],
  ["unnamed", "Waiting for a name"],
];

export function itemsViewHref(base: string, view: ItemsView, q: string): string {
  const p = new URLSearchParams();
  if (view === "archived") p.set("status", "archived");
  if (view === "unnamed") p.set("unnamed", "1");
  if (q) p.set("q", q);
  const qs = p.toString();
  return `${base}/items${qs ? `?${qs}` : ""}`;
}

// The pills are navigation (each is a URL), so the selected one carries
// aria-current — plus a border and a check, never colour alone.
export function ItemFilterPills({ base, view, q }: { base: string; view: ItemsView; q: string }) {
  return (
    <nav aria-label="Filter items">
      <ul className="flex flex-wrap gap-2">
        {PILLS.map(([v, label]) => {
          const on = v === view;
          return (
            <li key={v}>
              <Link
                href={itemsViewHref(base, v, q)}
                aria-current={on ? "page" : undefined}
                className={`inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm no-underline ${on ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline bg-glass text-ink"}`}
              >
                {on && <CheckIcon />}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
