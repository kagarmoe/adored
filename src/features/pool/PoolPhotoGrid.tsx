"use client";

import { getPoolPhotoAssetUrl } from "@/lib/photos";
import type { Photo } from "@/types";

export function PoolPhotoGrid({
  collectionId,
  photos,
}: {
  collectionId: string;
  photos: Pick<Photo, "id" | "filename">[];
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {photos.map((p) => (
        <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-surface-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPoolPhotoAssetUrl(collectionId, p.id)}
            alt={p.filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}
