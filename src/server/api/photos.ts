import { z } from "zod";
import type { Photo } from "@/types";
import { PhotoService } from "@/server/services/PhotoService";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

const UpdatePhotoSchema = z.object({
  isHero: z.boolean().optional(),
});

export type UpdatePhotoInput = z.infer<typeof UpdatePhotoSchema>;

export class PhotoController {
  private photoService: PhotoService;

  constructor(photoRepo: IPhotoRepository) {
    this.photoService = new PhotoService(photoRepo);
  }

  async listPhotos(itemId: string): Promise<Photo[]> {
    return this.photoService.getItemPhotos(itemId);
  }

  async uploadPhoto(
    collectionId: string,
    itemId: string,
    file: File,
    uploadedBy: string,
  ): Promise<Photo> {
    return this.photoService.uploadPhoto(collectionId, itemId, file, uploadedBy);
  }

  async getPhoto(photoId: string): Promise<Photo> {
    const photo = await this.photoService.getPhoto(photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }
    return photo;
  }

  async updatePhoto(photoId: string, data: unknown): Promise<Photo> {
    const parsed = UpdatePhotoSchema.parse(data);
    if (parsed.isHero) {
      const photo = await this.photoService.getPhoto(photoId);
      if (!photo) {
        throw new Error("Photo not found");
      }
      if (!photo.itemId) {
        throw new Error("Cannot set hero on a photo not assigned to an item");
      }
      return this.photoService.setHeroPhoto(photo.itemId, photoId);
    }
    return this.photoService.getPhoto(photoId) as Promise<Photo>;
  }

  async deletePhoto(photoId: string): Promise<Photo> {
    return this.photoService.deletePhoto(photoId);
  }
}
