import type { Collection } from "@/types";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  itemCount?: number;
  curators?: Array<{ id: string; name: string }>;
}

export function CollectionCard({ collection, itemCount = 0, curators = [] }: CollectionCardProps) {
  const getCuratorInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Link href={`/collections/${collection.id}`}>
      <Card interactive padding="none" className="overflow-hidden h-full flex flex-col">
        {/* Cover Photo */}
        <div className="h-32 bg-clay-soft flex items-center justify-center relative overflow-hidden">
          <span className="text-4xl">📷</span>
        </div>

        {/* Card Content */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg text-ink line-clamp-2">{collection.name}</h3>
              {collection.status !== "active" && (
                <Badge variant={collection.status} className="shrink-0">{collection.status}</Badge>
              )}
            </div>
            {collection.description && (
              <p className="text-sm text-ink-soft line-clamp-2">{collection.description}</p>
            )}
          </div>

          {/* Stats and Curators */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-ink-soft">
              <span>{itemCount} items</span>
              <span>{new Date(collection.updatedAt).toLocaleDateString()}</span>
            </div>

            {/* Curator Badges */}
            {curators.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {curators.map((curator) => (
                  <Badge key={curator.id} variant="curator" title={curator.name}>
                    {getCuratorInitials(curator.name)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
