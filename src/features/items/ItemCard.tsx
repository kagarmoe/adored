import type { Item } from "@/types";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";

interface ItemCardProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
  bucket?: "top" | "high" | "medium" | "low";
}

const bucketLabels = {
  top: "Top",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function ItemCard({ item, collectionId, heroPhotoUrl, bucket }: ItemCardProps) {
  return (
    <Link href={`/collections/${collectionId}/items/${item.id}`}>
      <Card interactive padding="none" className="overflow-hidden h-full flex flex-col">
        <div className="bg-gray-200 aspect-square flex items-center justify-center relative overflow-hidden">
          {heroPhotoUrl ? (
            <Image
              src={heroPhotoUrl}
              alt={item.name}
              fill
              className="object-cover"
            />
          ) : (
            <span className="text-4xl">📦</span>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
              {bucket && <Badge variant={bucket}>{bucketLabels[bucket]}</Badge>}
            </div>
            {item.brand && <p className="text-xs text-gray-600 truncate">{item.brand}</p>}
            {item.status && item.status !== "active" && (
              <Badge variant={item.status === "deleted" ? "deleted" : "archived"}>{item.status}</Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
