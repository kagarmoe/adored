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
  return getPhotoAssetUrl(collectionId, photo.itemId, photo.id);
}
