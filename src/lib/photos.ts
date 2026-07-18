import type { Photo } from "@/types";

export function getBlobAccess(url: string): "private" | "public" {
  return url.includes(".private.blob.vercel-storage.com/") ? "private" : "public";
}

/** Optional rendering hints for a photo asset URL. `w` selects a server-resized
 *  variant; `v` is an opaque cache-bust (the server ignores it for content) so a
 *  changed photo (e.g. rotation bumps updatedAt) yields a new URL within A's
 *  max-age window. */
export interface PhotoUrlOptions {
  w?: number;
  v?: number;
}

/** Allowed clockwise rotation values (degrees) for the rotate PATCH endpoints. */
export const ALLOWED_ROTATIONS = [0, 90, 180, 270] as const;

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
  const params = new URLSearchParams();
  if (opts?.w) params.set("w", String(opts.w));
  if (opts?.v) params.set("v", String(opts.v));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function withItemPhotoQuery(
  photoId: string,
  collectionId: string,
  itemId: string,
  opts?: PhotoUrlOptions,
): string {
  const params = new URLSearchParams({ collectionId, itemId });
  if (opts?.w) params.set("w", String(opts.w));
  if (opts?.v) params.set("v", String(opts.v));
  return `/api/photo-files/${encodeURIComponent(photoId)}?${params.toString()}`;
}

export function getPhotoAssetUrl(
  collectionId: string,
  itemId: string,
  photoId: string,
  opts?: PhotoUrlOptions
): string {
  return withItemPhotoQuery(photoId, collectionId, itemId, opts);
}

export function getPhotoAssetUrlForPhoto(
  photo: Pick<Photo, "id" | "itemId" | "updatedAt">,
  collectionId: string,
  opts?: PhotoUrlOptions
): string {
  if (!photo.itemId) {
    // Pool photos (no item yet) have no item-scoped asset URL. Pool/catalog-number
    // URLs arrive with the upload-to-pool work (purses-b1k, plans 2–3).
    throw new Error("Photo is not assigned to an item");
  }
  // Auto-bust the cache on any photo change (rotation bumps updatedAt) so every
  // item-photo surface refreshes within A's max-age window after a rotate.
  return getPhotoAssetUrl(collectionId, photo.itemId, photo.id, {
    ...opts,
    v: opts?.v ?? photo.updatedAt?.getTime(),
  });
}

export function getPoolPhotoAssetUrl(
  collectionId: string,
  photoId: string,
  opts?: PhotoUrlOptions
): string {
  return withQuery(`/api/collections/${collectionId}/pool/photos/${photoId}/file`, opts);
}

/** The token-scoped, public photo byte route for an anonymous shared-results
 *  viewer — authorized by the share token, not a session (purses-21x5.1). */
export function getSharedResultPhotoAssetUrl(
  token: string,
  photo: Pick<Photo, "id" | "updatedAt">,
  opts?: PhotoUrlOptions
): string {
  return withQuery(
    `/api/shared-results/${encodeURIComponent(token)}/photos/${encodeURIComponent(photo.id)}`,
    { ...opts, v: opts?.v ?? photo.updatedAt?.getTime() },
  );
}
