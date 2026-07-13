"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import type { Photo } from "@/types";
import Image from "next/image";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { PhotoMoveBar, type MoveDestination, type MoveTarget } from "./PhotoMoveBar";

interface PhotoGalleryProps {
  photos: Photo[];
  itemId: string;
  collectionId: string;
  otherItems: MoveTarget[];
}

export function PhotoGallery({
  photos: initialPhotos,
  itemId,
  collectionId,
  otherItems,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Multi-select "Move to…" flow — a separate concern from the per-photo
  // hover Hero/Delete controls. Selection lives on a tap of the image area.
  const [selected, setSelected] = useState<string[]>([]); // selection order
  const [moving, setMoving] = useState(false);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // The move confirmation is a quiet, auto-dismissing note so it never lingers.
  useEffect(() => {
    if (!moveNote) return;
    const timer = setTimeout(() => setMoveNote(null), 4000);
    return () => clearTimeout(timer);
  }, [moveNote]);

  const toggleSelect = (photoId: string) => {
    // Re-picking the selection clears any stale move error so an old red alert
    // doesn't linger while the user reconsiders.
    setMoveError(null);
    setSelected((prev) =>
      prev.includes(photoId) ? prev.filter((x) => x !== photoId) : [...prev, photoId],
    );
  };

  const moveTo = async (dest: MoveDestination) => {
    if (selected.length === 0 || moving) return;
    setMoving(true);
    setMoveError(null);
    setMoveNote(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/photos/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selected, destination: dest }),
      });
      if (!res.ok) {
        throw new Error("reassign failed");
      }
      // Optimistic: drop the moved photos from this gallery. If a moved photo was
      // this item's hero, the server promotes a remaining photo to hero; that new
      // hero shows on next load. Mirrors the pool "stay in place" pattern — the
      // source gallery is not the source of truth for the moved photos' new home.
      const moved = new Set(selected);
      setPhotos((prev) => prev.filter((p) => !moved.has(p.id)));
      setSelected([]);
      setMoveNote(
        dest.type === "new"
          ? "Now their own item — find it in your items."
          : dest.type === "pool"
            ? "Back in the pool — find them under Add photos."
            : "Moved — find them on that item.",
      );
    } catch {
      setMoveError("We couldn’t move those just now — your photos are safe; try again.");
    } finally {
      setMoving(false);
    }
  };

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
      {moveNote && (
        <p className="rounded-lg bg-success-soft px-4 py-2 text-success-deep" role="status">
          {moveNote}
        </p>
      )}
      {moveError && (
        <p className="rounded-lg bg-error-soft px-4 py-2 text-error-deep" role="alert">
          {moveError}
        </p>
      )}
      {error && (
        <Card padding="md" className="bg-error-soft border border-error-soft">
          <p className="text-error-deep text-sm">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        {photos.map((photo) => {
          const isSelected = selected.includes(photo.id);
          return (
            <div
              key={photo.id}
              className="bg-ground rounded-lg overflow-hidden relative"
            >
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label="Select photo"
                onClick={() => toggleSelect(photo.id)}
                className={`block aspect-square w-full relative outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
                }`}
              >
                <Image
                  src={getPhotoAssetUrlForPhoto(photo, collectionId, { w: PHOTO_WIDTH.galleryTile })}
                  alt="Item photo"
                  fill
                  className="object-cover"
                  unoptimized
                />
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-primary-ink shadow-sm"
                  >
                    ✓
                  </span>
                )}
              </button>

              {photo.isHero && (
                <span
                  aria-hidden
                  className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-ink shadow-sm pointer-events-none"
                >
                  Hero
                </span>
              )}

              {/* Per-photo actions stay visible (no hover gate) so they are
                  reachable on touch — this is the tablet-first photo manager.
                  stopPropagation keeps them from toggling tile selection. */}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-2">
                <div className="flex gap-2 w-full px-2">
                  {!photo.isHero && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetHero(photo.id);
                      }}
                      disabled={loading === photo.id}
                      className="flex-1"
                    >
                      {loading === photo.id ? "..." : "Hero"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(photo.id);
                    }}
                    disabled={loading === photo.id}
                    className={!photo.isHero ? "" : "w-full"}
                  >
                    {loading === photo.id ? "..." : "Delete"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected.length > 0 && <div aria-hidden className="h-20" />}

      <PhotoMoveBar
        count={selected.length}
        busy={moving}
        targets={otherItems}
        onMove={moveTo}
        onClear={() => setSelected([])}
      />
    </div>
  );
}
