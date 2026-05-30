import { Button } from "@/components/ui";
import Link from "next/link";

const filters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
] as const;

interface CollectionFiltersProps {
  activeFilter: string;
}

export function CollectionFilters({ activeFilter }: CollectionFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <Link key={filter.value} href={filter.value === "all" ? "/collections" : `/collections?status=${filter.value}`}>
          <Button
            size="sm"
            variant={activeFilter === filter.value ? "primary" : "secondary"}
          >
            {filter.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
