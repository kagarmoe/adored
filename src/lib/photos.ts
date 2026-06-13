import type { Photo } from "@/types";

export function getBlobAccess(url: string): "private" | "public" {
  return url.includes(".private.blob.vercel-storage.com/") ? "private" : "public";
}

export function getPhotoAssetUrl(
  collectionId: string,
  itemId: string,
  photoId: string
): string {
  return `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}/file`;
}

export function getPhotoAssetUrlForPhoto(
  photo: Pick<Photo, "id" | "itemId">,
  collectionId: string
): string {
  if (!photo.itemId) {
    // Pool photos (no item yet) have no item-scoped asset URL. Pool/catalog-number
    // URLs arrive with the upload-to-pool work (purses-b1k, plans 2–3).
    throw new Error("Photo is not assigned to an item");
  }
  return getPhotoAssetUrl(collectionId, photo.itemId, photo.id);
}
