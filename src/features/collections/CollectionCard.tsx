import type { Collection } from "@/types";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  itemCount?: number;
  role?: "owner" | "curator";
}

export function CollectionCard({ collection, itemCount = 0, role = "owner" }: CollectionCardProps) {
  return (
    <Link href={`/collections/${collection.id}`}>
      <Card interactive padding="md">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{collection.name}</h3>
              <div className="flex shrink-0 gap-2">
                <Badge variant={role}>{role === "owner" ? "Owner" : "Curator"}</Badge>
                {collection.status !== "active" && (
                  <Badge variant={collection.status}>{collection.status}</Badge>
                )}
              </div>
            </div>
            {collection.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{collection.description}</p>
            )}
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <span>{itemCount} items</span>
            <span>{new Date(collection.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
