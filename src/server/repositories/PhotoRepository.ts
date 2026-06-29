import type { Photo } from "@/types";

export interface IPhotoRepository {
  create(
    data: Omit<Photo, "id" | "createdAt" | "updatedAt" | "deletedAt" | "rotation"> & {
      rotation?: number;
    },
  ): Promise<Photo>;
  findById(id: string): Promise<Photo | null>;
  findByIds(collectionId: string, photoIds: string[]): Promise<Photo[]>;
  findByItem(itemId: string): Promise<Photo[]>;
  findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>>;
  findCoverPhotosByCollectionIds(collectionIds: string[]): Promise<Map<string, Photo>>;
  // Which of the GIVEN collections hold >=1 pooled photo (item_id IS NULL, not
  // deleted). Bounded aggregate cue for /collections; NOT an access boundary —
  // callers must pass only already-access-filtered ids (see implementation note).
  findCollectionIdsWithPooledPhotos(collectionIds: string[]): Promise<Set<string>>;
  // Loose photos of a collection, oldest first (created_at ASC, id ASC). Optional
  // `limit` bounds the read at the SQL layer for the bounded workspace preview;
  // omit it for the full pool.
  findPoolByCollection(collectionId: string, limit?: number): Promise<Photo[]>;
  update(id: string, data: Partial<Omit<Photo, "id" | "createdAt">>): Promise<Photo>;
  softDelete(id: string): Promise<Photo>;
  clearHeroPhotos(itemId: string): Promise<void>;
  setHero(photoId: string, itemId: string): Promise<Photo>;
  reassignPhotos(
    collectionId: string,
    photoIds: string[],
    targetItemId: string | null,
    heroPhotoId: string | null,
  ): Promise<number>;
  assignPooledPhotosToItem(
    collectionId: string,
    photoIds: string[],
    itemId: string,
    heroPhotoId: string,
  ): Promise<number>;
  countAvailablePooled(collectionId: string, photoIds: string[]): Promise<number>;
  unassignAllFromItem(itemId: string): Promise<number>;
  // Permanently DELETE every photo of an item (active AND soft-deleted),
  // returning their blob keys so the caller can clean up blob storage. Purge-only.
  hardDeleteByItem(itemId: string): Promise<string[]>;
  // Permanently DELETE every photo of the collection (active AND soft-deleted,
  // assigned AND pooled), returning their blob keys for blob cleanup. Purge-only.
  hardDeleteByCollection(collectionId: string): Promise<string[]>;
}
