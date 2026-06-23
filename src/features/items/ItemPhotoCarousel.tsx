"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPhotoAssetUrl } from "@/lib/photos";
import { PhotoViewControl, type ViewerPhoto } from "@/components/ui";
import { PhotoDeleteControl } from "./PhotoDeleteControl";

const MAX_DOTS = 6;

interface ItemPhotoCarouselProps {
  /** Already ordered (hero first) by the page. */
  photos: ViewerPhoto[];
  collectionId: string;
  itemName: string;
  addPhotosHref: string;
  /** Whether this viewer may delete photos. Under the role model any curator
   *  (member-or-owner) may delete (photos:write); when false the per-photo
   *  delete control is hidden — it would only 403. */
  canDelete?: boolean;
}

/** Tap-first flip-through of an item's photos. No swipe: navigate with the
 *  Prev/Next arrows, the dots/counter, or ArrowLeft/Right. Rotate + zoom reuse
 *  the shared ImageViewer via PhotoViewControl on the current photo. */
export function ItemPhotoCarousel({
  photos: initialPhotos,
  collectionId,
  itemName,
  addPhotosHref,
  canDelete = false,
}: ItemPhotoCarouselProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Local source of truth so a deleted photo drops out immediately (optimistic,
  // mirroring PhotoGallery). The render clamps `current` to the new length.
  const [photos, setPhotos] = useState(initialPhotos);

  // Drop the deleted photo locally for an instant response, then refresh so the
  // page's other photo-derived bits (e.g. a server-promoted hero) re-sync. A
  // deleted hero is re-promoted server-side and shows on the refreshed render.
  const handleDeleted = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  };

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-card bg-surface p-6 text-center ring-1 ring-hairline">
        <p className="text-ink-soft">Add photos whenever you like — they help you see what you love.</p>
        <Link href={addPhotosHref} className="text-primary underline underline-offset-2">
          Add photos
        </Link>
      </div>
    );
  }

  const current = Math.min(index, photos.length - 1);
  const photo = photos[current];
  const src = getPhotoAssetUrl(collectionId, photo.itemId, photo.id, {
    w: 1280,
    v: new Date(photo.updatedAt).getTime(),
  });
  const atStart = current === 0;
  const atEnd = current === photos.length - 1;
  const go = (i: number) => setIndex(Math.min(photos.length - 1, Math.max(0, i)));
  const multi = photos.length > 1;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${itemName}`}
      tabIndex={0}
      className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(current - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(current + 1);
        }
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-ground">
        <Image
          key={photo.id}
          src={src}
          alt={photo.alt ?? itemName}
          fill
          unoptimized
          className="object-contain"
        />
        <PhotoViewControl photo={photo} className="absolute right-3 top-3 z-20" />
        {canDelete && (
          <PhotoDeleteControl
            collectionId={collectionId}
            itemId={photo.itemId}
            photoId={photo.id}
            onDeleted={() => handleDeleted(photo.id)}
            className="absolute left-3 top-3 z-20"
          />
        )}
        {multi && (
          <>
            <NavArrow side="left" label="Previous photo" disabled={atStart} onClick={() => go(current - 1)} />
            <NavArrow side="right" label="Next photo" disabled={atEnd} onClick={() => go(current + 1)} />
          </>
        )}
      </div>

      {multi && (
        <div className="mt-3 flex items-center justify-center">
          {photos.length <= MAX_DOTS ? (
            <div className="flex items-center gap-1">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Go to photo ${i + 1}`}
                  aria-current={i === current}
                  onClick={() => go(i)}
                  className="inline-flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    className={`block h-2 w-2 rounded-full ${i === current ? "bg-primary" : "bg-ink-soft/70"}`}
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              {current + 1} of {photos.length}
            </p>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        Photo {current + 1} of {photos.length}
      </p>
    </div>
  );
}

function NavArrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={`absolute top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink ring-1 ring-ink/10 shadow-lift transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${side === "left" ? "left-3" : "right-3"} ${disabled ? "opacity-40" : ""}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d={side === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
