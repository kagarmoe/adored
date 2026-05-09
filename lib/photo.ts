export interface PhotoLike {
  blobKey: string
  originalBlobKey: string
  bgRemoved: boolean
}

export function displayPhotoUrl(photo: PhotoLike): string {
  return photo.blobKey
}

export function hasProcessedVersion(photo: PhotoLike): boolean {
  return Boolean(photo.originalBlobKey) && photo.originalBlobKey !== photo.blobKey
}
