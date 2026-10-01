import type { Item } from "@/types";
import type { UsageAnswer } from "@/lib/derive-usage";
import { hasName, itemDisplayName, itemInitial } from "@/lib/items";
import { usageChipLabel } from "@/features/items/usage-chip-copy";
import { Badge, Card, CardImage, PhotoViewControl, type ViewerPhoto } from "@/components/ui";
import Link from "next/link";

interface ItemCardProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
  bucket?: "top" | "high" | "medium" | "low";
  /** Override the image area sizing (default a square). Triage caps height so
   *  the decision buttons stay above the fold. */
  imageClassName?: string;
  /** When set, a "view photo" control opens the zoom/rotate lightbox for the hero. */
  viewerPhoto?: ViewerPhoto;
  /** Epic S1: a quiet, count-free usage note ("In your life" / "Resting").
   *  Absent (undefined) when this item's usage is undecided — no chip renders. */
  usage?: UsageAnswer;
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

export function ItemCard({
  item,
  collectionId,
  heroPhotoUrl,
  bucket,
  imageClassName = "aspect-square",
  viewerPhoto,
  usage,
}: ItemCardProps) {
  // Stretched-link: the navigating <Link> is an overlay sibling so the view
  // control is valid DOM. `isolate` keeps the control (z-20) above the link (z-10).
  return (
    <Card interactive padding="none" className="relative isolate flex h-full flex-col overflow-hidden">
      <div className={`bg-content-soft ${imageClassName} relative flex items-center justify-center overflow-hidden`}>
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
      <div className="flex flex-1 flex-col justify-between p-3">
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
          {/* Epic S1 usage chip: a quiet, count-free note. Meaning is carried by
              the words (not color), and the neutral "active" variant is AA in
              both themes. No chip when usage is undecided (undefined). */}
          {usage && (
            <Badge variant="active" className="w-fit text-xs">
              {usageChipLabel(usage)}
            </Badge>
          )}
        </div>
      </div>

      <Link
        href={`/collections/${collectionId}/items/${item.number}`}
        className="absolute inset-0 z-10"
        aria-label={itemDisplayName(item)}
      />
      {viewerPhoto && <PhotoViewControl photo={viewerPhoto} className="absolute right-2 top-2 z-20" />}
    </Card>
  );
}
