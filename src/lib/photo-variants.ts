import { list, del } from "@vercel/blob";

/** Deterministic pathname for a persisted resized variant. `version` (a photo's
 *  updatedAt ms) busts the key when the photo changes (e.g. rotation). */
export function variantPath(
  collectionId: string,
  photoId: string,
  width: number,
  version: number,
): string {
  return `variants/${collectionId}/${photoId}/w${width}-v${version}.webp`;
}

/** Prefix covering all of a photo's variants (every width + version), or the
 *  whole collection's variants when `photoId` is omitted. */
export function variantPrefix(collectionId: string, photoId?: string): string {
  return photoId ? `variants/${collectionId}/${photoId}/` : `variants/${collectionId}/`;
}

/** Best-effort removal of every variant blob under `prefix`. Never throws — a
 *  failure leaves inert, sweepable orphans (mirrors the purge services' del). */
export async function deleteVariants(prefix: string): Promise<void> {
  try {
    let cursor: string | undefined;
    do {
      const res = await list({ prefix, cursor });
      if (res.blobs.length > 0) await del(res.blobs.map((b) => b.url));
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error("deleteVariants failed (orphaned, sweepable)", { prefix, error });
  }
}
