"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import type { Photo } from "@/types";
import Image from "next/image";

interface PhotoGalleryProps {
  photos: Photo[];
  itemId: string;
  collectionId: string;
}

export function PhotoGallery({
  photos: initialPhotos,
  itemId,
  collectionId,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSetHero = async (photoId: string) => {
    setLoading(photoId);
    setError(null);

    try {
      const response = await fetch(
        `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}/set-hero`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to set hero photo");
      }

      setPhotos((prev) =>
        prev.map((p) => ({
          ...p,
          isHero: p.id === photoId,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm("Delete this photo?")) return;

    setLoading(photoId);
    setError(null);

    try {
      const response = await fetch(
        `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete photo");
      }

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card padding="md" className="bg-error-soft border border-error-soft">
          <p className="text-error-deep text-sm">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="bg-vellum rounded-lg overflow-hidden relative group"
          >
            <div className="aspect-square relative">
              <Image
                src={photo.blobKey}
                alt="Item photo"
                fill
                className="object-cover"
              />
            </div>

            {photo.isHero && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">Hero</span>
              </div>
            )}

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
              <div className="flex gap-2 w-full px-2">
                {!photo.isHero && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetHero(photo.id)}
                    disabled={loading === photo.id}
                    className="flex-1"
                  >
                    {loading === photo.id ? "..." : "Hero"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(photo.id)}
                  disabled={loading === photo.id}
                  className={!photo.isHero ? "" : "w-full"}
                >
                  {loading === photo.id ? "..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
