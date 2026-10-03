"use client";

import { useRef, useState } from "react";
import { ImageViewer, type ViewerPhoto } from "./ImageViewer";

/** A gentle "view photo" control overlaid on a card image. Opens the ImageViewer
 *  (zoom + rotate). Rendered as a sibling of the card's stretched <Link> (not a
 *  descendant), so it's valid DOM and its tap doesn't navigate. Opaque backplate +
 *  hairline ring keep it ≥3:1 against light/busy or dark photos in both themes. */
export function PhotoViewControl({
  photo,
  className,
}: {
  photo: ViewerPhoto;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus(); // restore focus to the trigger
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="View photo"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink ring-1 ring-hairline shadow-lift transition-colors hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}
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
      {open && <ImageViewer photo={photo} onClose={close} />}
    </>
  );
}
