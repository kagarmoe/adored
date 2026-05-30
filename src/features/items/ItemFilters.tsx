import { Button } from "@/components/ui";
import Link from "next/link";

const filters = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "Deleted", value: "deleted" },
] as const;

interface ItemFiltersProps {
  activeFilter: string;
  collectionId: string;
}

export function ItemFilters({ activeFilter, collectionId }: ItemFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <Link
          key={filter.value}
          href={
            filter.value === "all"
              ? `/collections/${collectionId}/items`
              : `/collections/${collectionId}/items?status=${filter.value}`
          }
        >
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
