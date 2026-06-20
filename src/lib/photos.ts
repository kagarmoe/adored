import type { Photo } from "@/types";

export function getBlobAccess(url: string): "private" | "public" {
  return url.includes(".private.blob.vercel-storage.com/") ? "private" : "public";
}

/** Optional rendering hints for a photo asset URL. `w` selects a server-resized
 *  variant; omit it for the full-resolution original (zoom/download). */
export interface PhotoUrlOptions {
  w?: number;
}

/** Per-surface request widths (one per surface — `unoptimized` precludes srcset).
 *  Must be members of RESIZE_WIDTHS in photo-serving.ts. */
export const PHOTO_WIDTH = {
  /** Cards/grids: ItemCard, CollectionCard, CompareChoice, MostLovedHero, triage. */
  card: 640,
  /** Dense pool grid (up to 6 cols). */
  poolTile: 320,
  /** Item-detail hero. */
  hero: 1280,
  /** Item-detail / photo-manager gallery thumbnails. */
  galleryTile: 640,
} as const;

function withQuery(base: string, opts?: PhotoUrlOptions): string {
  return opts?.w ? `${base}?w=${opts.w}` : base;
}

export function getPhotoAssetUrl(
  collectionId: string,
  itemId: string,
  photoId: string,
  opts?: PhotoUrlOptions
): string {
  return withQuery(
    `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}/file`,
    opts
  );
}

export function getPhotoAssetUrlForPhoto(
  photo: Pick<Photo, "id" | "itemId">,
  collectionId: string,
  opts?: PhotoUrlOptions
): string {
  if (!photo.itemId) {
    // Pool photos (no item yet) have no item-scoped asset URL. Pool/catalog-number
    // URLs arrive with the upload-to-pool work (purses-b1k, plans 2–3).
    throw new Error("Photo is not assigned to an item");
  }
  return getPhotoAssetUrl(collectionId, photo.itemId, photo.id, opts);
}

export function getPoolPhotoAssetUrl(
  collectionId: string,
  photoId: string,
  opts?: PhotoUrlOptions
): string {
  return withQuery(`/api/collections/${collectionId}/pool/photos/${photoId}/file`, opts);
}
