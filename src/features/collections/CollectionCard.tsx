import type { Collection } from "@/types";
import { Card } from "@/components/ui";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  itemCount?: number;
}

export function CollectionCard({ collection, itemCount = 0 }: CollectionCardProps) {
  return (
    <Link href={`/collections/${collection.id}`}>
      <Card interactive padding="md">
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{collection.name}</h3>
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
