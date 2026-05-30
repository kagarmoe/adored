import type { Item } from "@/types";
import { Card } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";

interface ItemCardProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
}

export function ItemCard({ item, collectionId, heroPhotoUrl }: ItemCardProps) {
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
          <div>
            <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
            {item.brand && <p className="text-xs text-gray-600 truncate">{item.brand}</p>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
