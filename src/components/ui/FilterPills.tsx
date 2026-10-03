import Link from "next/link";
import { CheckIcon } from "./CheckIcon";

export interface FilterPill {
  label: string;
  href: string;
  current: boolean;
}

// Filter pills (DESIGN.md §5): 44px, pill radius; the current one is chip fill +
// primary border + a check glyph, never colour alone. Links, so a filter is a URL.
export function FilterPills({ label, pills }: { label: string; pills: FilterPill[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {pills.map((pill) => (
          <li key={pill.href}>
            <Link
              href={pill.href}
              aria-current={pill.current ? "page" : undefined}
              className={`inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm no-underline ${pill.current ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline bg-glass text-ink"}`}
            >
              {pill.current && <CheckIcon />}
              {pill.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
