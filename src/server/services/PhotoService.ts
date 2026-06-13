import type { Photo } from "@/types";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export class PhotoService {
  constructor(private photoRepo: IPhotoRepository) {}

  async uploadPhoto(
    collectionId: string,
    itemId: string,
    file: File,
    uploadedBy: string,
  ): Promise<Photo> {
    // TODO: Upload file to Vercel Blob and get blobKey
    // const blobKey = await uploadToBlob(file);
    const blobKey = `temp_${Date.now()}`;

    return this.photoRepo.create({
      itemId,
      collectionId,
      blobKey,
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy,
      isHero: false,
    });
  }

  async getPhoto(photoId: string): Promise<Photo | null> {
    return this.photoRepo.findById(photoId);
  }

  async getItemPhotos(itemId: string): Promise<Photo[]> {
    return this.photoRepo.findByItem(itemId);
  }

  async deletePhoto(photoId: string): Promise<Photo> {
    const photo = await this.photoRepo.findById(photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }
    // TODO: Delete from Vercel Blob using blobKey
    return this.photoRepo.softDelete(photoId);
  }

  async setHeroPhoto(itemId: string, photoId: string): Promise<Photo> {
    // Atomically clear hero on all other photos in this item using single query
    await this.photoRepo.clearHeroPhotos(itemId);
    // Set this photo as hero
    return this.photoRepo.update(photoId, { isHero: true });
  }
}
