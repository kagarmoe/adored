import type { Item, Photo } from "@/types";
import { ItemCard } from "@/features/items/ItemCard";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";

interface ItemPreviewGridProps {
  items: Item[];
  /** Cover photos keyed by item id, from findCoverPhotosByItemIds (no N+1). */
  covers: Map<string, Photo>;
  /** Resolved collection id — used only to build the guarded item /file URLs. */
  collectionId: string;
  /** Slug-or-id path segment for item detail links. */
  collectionSlugOrId: string;
}

// Minimal bounded item preview for the workspace. Reuses ItemCard so the card
// markup has one definition; the full /items grid stays canonical.
export function ItemPreviewGrid({ items, covers, collectionId, collectionSlugOrId }: ItemPreviewGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const cover = covers.get(item.id);
        return (
          <li key={item.id}>
            <ItemCard
              item={item}
              collectionId={collectionSlugOrId}
              heroPhotoUrl={
                cover ? getPhotoAssetUrlForPhoto(cover, collectionId, { w: PHOTO_WIDTH.card }) : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
