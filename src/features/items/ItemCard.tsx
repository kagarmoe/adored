import type { Item } from "@/types";
import { hasName, itemDisplayName, itemInitial } from "@/lib/items";
import { Badge, Card, CardImage } from "@/components/ui";
import Link from "next/link";

interface ItemCardProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
  bucket?: "top" | "high" | "medium" | "low";
  /** Override the image area sizing (default a square). Triage caps height so
   *  the decision buttons stay above the fold. */
  imageClassName?: string;
}

const bucketDots = {
  top: "●●●●",
  high: "●●●",
  medium: "●●",
  low: "●",
};

const bucketLabels = {
  top: "Love",
  high: "Like",
  medium: "Maybe",
  low: "Onward",
};

export function ItemCard({ item, collectionId, heroPhotoUrl, bucket, imageClassName = "aspect-square" }: ItemCardProps) {
  return (
    <Link href={`/collections/${collectionId}/items/${item.number}`}>
      <Card interactive padding="none" className="overflow-hidden h-full flex flex-col">
        <div className={`bg-accent-aqua ${imageClassName} flex items-center justify-center relative overflow-hidden`}>
          <CardImage
            src={heroPhotoUrl}
            alt={itemDisplayName(item)}
            fallback={
              <span className="font-display text-5xl text-ink-soft" aria-hidden>
                {itemInitial(item)}
              </span>
            }
          />
        </div>
        <div className="p-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-ink truncate">{itemDisplayName(item)}</h3>
              {bucket && <Badge variant={bucket} title={bucketLabels[bucket]}>{bucketDots[bucket]}</Badge>}
            </div>
            {hasName(item) ? (
              item.brand && <p className="text-xs text-ink-soft truncate">{item.brand}</p>
            ) : (
              <p className="text-xs text-ink-soft truncate">Add a name</p>
            )}
            {item.status && item.status !== "active" && (
              <Badge variant={item.status === "deleted" ? "deleted" : "archived"}>{item.status}</Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
