import type { Photo } from "@/types";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export class PhotoService {
  constructor(private photoRepo: IPhotoRepository) {}

  async uploadPhoto(itemId: string, file: File, uploadedBy: string): Promise<Photo> {
    // TODO: Upload file to Vercel Blob and get blobKey
    // const blobKey = await uploadToBlob(file);
    const blobKey = `temp_${Date.now()}`;

    return this.photoRepo.create({
      itemId,
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

  async deletePhoto(photoId: string): Promise<void> {
    const photo = await this.photoRepo.findById(photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }
    // TODO: Delete from Vercel Blob using blobKey
    await this.photoRepo.softDelete(photoId);
  }

  async setHeroPhoto(itemId: string, photoId: string): Promise<Photo> {
    // First, clear hero status from other photos in this item
    const itemPhotos = await this.photoRepo.findByItem(itemId);
    for (const photo of itemPhotos) {
      if (photo.isHero && photo.id !== photoId) {
        await this.photoRepo.update(photo.id, { isHero: false });
      }
    }

    // Set this photo as hero
    return this.photoRepo.update(photoId, { isHero: true });
  }
}
