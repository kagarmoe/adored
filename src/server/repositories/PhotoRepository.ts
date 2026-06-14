import type { Photo } from "@/types";

export interface IPhotoRepository {
  create(data: Omit<Photo, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Photo>;
  findById(id: string): Promise<Photo | null>;
  findByItem(itemId: string): Promise<Photo[]>;
  findPoolByCollection(collectionId: string): Promise<Photo[]>;
  update(id: string, data: Partial<Omit<Photo, "id" | "createdAt">>): Promise<Photo>;
  softDelete(id: string): Promise<Photo>;
  clearHeroPhotos(itemId: string): Promise<void>;
  assignPooledPhotosToItem(
    collectionId: string,
    photoIds: string[],
    itemId: string,
    heroPhotoId: string,
  ): Promise<number>;
  countAvailablePooled(collectionId: string, photoIds: string[]): Promise<number>;
}
