import type { Database } from "@/lib/db";
import type { Photo } from "@/types";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";
import { withTransaction } from "@/lib/transactions";
import { recordPooledPhoto, type PooledPhotoInput } from "@/server/photos/recordPooledPhoto";

export class PhotoController {
  private photoRepo: PhotoRepository;

  constructor(private db: Database) {
    this.photoRepo = new PhotoRepository(db);
  }

  static fromDb(db: Database): PhotoController {
    return new PhotoController(db);
  }

  async findById(photoId: string): Promise<Photo | null> {
    return this.photoRepo.findById(photoId);
  }

  // `limit` opts into the bounded workspace preview (e.g. 6); omit for the full pool.
  async findPoolByCollection(collectionId: string, limit?: number): Promise<Photo[]> {
    return this.photoRepo.findPoolByCollection(collectionId, limit);
  }

  async findByItem(itemId: string): Promise<Photo[]> {
    return this.photoRepo.findByItem(itemId);
  }

  async findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>> {
    return this.photoRepo.findCoverPhotosByItemIds(itemIds);
  }

  async findCoverPhotosByCollectionIds(collectionIds: string[]): Promise<Map<string, Photo>> {
    return this.photoRepo.findCoverPhotosByCollectionIds(collectionIds);
  }

  // Access-scoped pool cue for /collections: callers MUST pass the authenticated
  // user's already-access-filtered collection ids (from listCollections), never
  // raw/client ids — the repo method is bounded but not an access boundary.
  async findCollectionIdsWithPooledPhotos(collectionIds: string[]): Promise<Set<string>> {
    return this.photoRepo.findCollectionIdsWithPooledPhotos(collectionIds);
  }

  async update(photoId: string, data: Partial<Photo>): Promise<Photo> {
    return this.photoRepo.update(photoId, data);
  }

  async setHero(photoId: string, itemId: string): Promise<void> {
    await this.photoRepo.setHero(photoId, itemId);
  }

  /** Hard-deletes the photo row + records audit in one transaction. Returns blobKey for post-commit blob cleanup. */
  async deleteWithAudit(
    photo: Photo,
    actorId: string,
  ): Promise<{ blobKey: string }> {
    await withTransaction(this.db, async (tx) => {
      await new PhotoRepository(tx).delete(photo.id);
      await new AuditLogRepository(tx).record({
        actorId,
        action: "photo.delete",
        targetType: "photo",
        targetId: photo.id,
        collectionId: photo.collectionId,
      });
    });
    return { blobKey: photo.blobKey };
  }

  async create(data: Parameters<PhotoRepository["create"]>[0]): Promise<Photo> {
    return this.photoRepo.create(data);
  }

  async recordPooled(input: PooledPhotoInput): Promise<Photo> {
    return recordPooledPhoto(this.photoRepo, input);
  }
}
