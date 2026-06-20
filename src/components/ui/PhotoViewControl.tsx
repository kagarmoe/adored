"use client";

import { useState } from "react";
import { ImageViewer, type ViewerPhoto } from "./ImageViewer";

/** A gentle "view photo" control overlaid on a card image. Opens the ImageViewer
 *  (zoom + rotate). Rendered as a sibling of the card's stretched <Link> (not a
 *  descendant), so it's valid DOM and its tap doesn't trigger navigation. */
export function PhotoViewControl({
  photo,
  className,
}: {
  photo: ViewerPhoto;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="View photo"
        onClick={() => setOpen(true)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-ink shadow-lift transition-colors hover:bg-surface ${className ?? ""}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <ImageViewer photo={photo} onClose={() => setOpen(false)} />}
    </>
  );
}
