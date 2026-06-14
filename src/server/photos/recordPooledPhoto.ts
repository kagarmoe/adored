import type { Photo } from "@/types";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";

export interface PooledPhotoInput {
  collectionId: string;
  uploadedBy: string;
  blobKey: string;
  filename: string;
  mimeType: string;
  /** Size in bytes; null when the upload provider does not report it. */
  fileSize: number | null;
}

export function recordPooledPhoto(
  photoRepo: IPhotoRepository,
  input: PooledPhotoInput,
): Promise<Photo> {
  return photoRepo.create({
    itemId: null,
    collectionId: input.collectionId,
    blobKey: input.blobKey,
    filename: input.filename,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    uploadedBy: input.uploadedBy,
    isHero: false,
  });
}
