import type { Item } from "@/types";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";

interface ItemCardProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
  bucket?: "top" | "high" | "medium" | "low";
  /** Mark the single most-loved item (rank #1) with the affirmation spark. */
  isTop?: boolean;
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
  low: "Release",
};

export function ItemCard({ item, collectionId, heroPhotoUrl, bucket, isTop = false, imageClassName = "aspect-square" }: ItemCardProps) {
  return (
    <Link href={`/collections/${collectionId}/items/${item.id}`}>
      <Card interactive padding="none" className="overflow-hidden h-full flex flex-col">
        <div className={`bg-accent-aqua ${imageClassName} flex items-center justify-center relative overflow-hidden`}>
          {isTop && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-spark px-2 py-0.5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 text-spark-ink" aria-hidden="true">
                <path d="M12 2.5l2.1 5.6 5.9.3-4.6 3.7 1.6 5.7L12 20.3 7 17.8l1.6-5.7-4.6-3.7 5.9-.3z" />
              </svg>
              <span className="text-[0.6875rem] font-semibold text-spark-ink">Most loved</span>
            </div>
          )}
          {heroPhotoUrl ? (
            <Image
              src={heroPhotoUrl}
              alt={item.name}
              fill
              className="object-cover"
            />
          ) : (
            <span className="font-display text-5xl text-ink-soft" aria-hidden>
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-ink truncate">{item.name}</h3>
              {bucket && <Badge variant={bucket} title={bucketLabels[bucket]}>{bucketDots[bucket]}</Badge>}
            </div>
            {item.brand && <p className="text-xs text-ink-soft truncate">{item.brand}</p>}
            {item.status && item.status !== "active" && (
              <Badge variant={item.status === "deleted" ? "deleted" : "archived"}>{item.status}</Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
