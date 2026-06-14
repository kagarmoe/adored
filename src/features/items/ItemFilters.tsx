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
  unnamed: boolean;
  collectionId: string;
}

function itemsUrl(collectionId: string, status: string, unnamed: boolean): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (unnamed) params.set("unnamed", "1");
  const qs = params.toString();
  return `/collections/${collectionId}/items${qs ? `?${qs}` : ""}`;
}

export function ItemFilters({ activeFilter, unnamed, collectionId }: ItemFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <Link key={filter.value} href={itemsUrl(collectionId, filter.value, unnamed)}>
          <Button size="sm" variant={activeFilter === filter.value ? "primary" : "secondary"}>
            {filter.label}
          </Button>
        </Link>
      ))}
      <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
      <Link href={itemsUrl(collectionId, activeFilter, !unnamed)}>
        <Button size="sm" variant={unnamed ? "primary" : "secondary"}>
          Waiting for a name
        </Button>
      </Link>
    </div>
  );
}
