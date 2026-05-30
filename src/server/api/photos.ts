import { z } from "zod";
import type { Photo } from "@/types";

const UpdatePhotoSchema = z.object({
  isHero: z.boolean().optional(),
});

export type UpdatePhotoInput = z.infer<typeof UpdatePhotoSchema>;

export class PhotoController {
  // TODO: Implement photo CRUD with Vercel Blob integration
  async listPhotos(itemId: string): Promise<Photo[]> {
    return [];
  }

  async uploadPhoto(itemId: string, file: File, uploadedBy: string): Promise<Photo> {
    // TODO: Upload to Vercel Blob, create photo record
    throw new Error("Not implemented");
  }

  async getPhoto(photoId: string): Promise<Photo> {
    throw new Error("Not implemented");
  }

  async updatePhoto(photoId: string, data: unknown): Promise<Photo> {
    const parsed = UpdatePhotoSchema.parse(data);
    // TODO: Update photo metadata
    throw new Error("Not implemented");
  }

  async deletePhoto(photoId: string): Promise<void> {
    // TODO: Delete photo record and blob
  }
}
