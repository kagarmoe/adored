"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getPhotoAssetUrl } from "@/lib/photos";
import { Button, OverflowMenu, type ViewerPhoto } from "@/components/ui";
import { ImageViewer } from "@/components/ui/ImageViewer";
import { PoolUpload } from "@/features/pool/PoolUpload";

const MAX_DOTS = 6;
const SWIPE_MIN_PX = 40;

export type CarouselPhoto = ViewerPhoto & { isHero: boolean };

interface ItemPhotoCarouselProps {
  /** Already ordered (cover first, then upload order) by the page. */
  photos: CarouselPhoto[];
  collectionId: string;
  itemId: string;
  itemName: string;
}

// What a server refresh can change about the list; a change re-seeds local state.
const signature = (ps: CarouselPhoto[]) =>
  ps.map((p) => `${p.id}:${p.isHero ? 1 : 0}:${String(p.updatedAt)}`).join();

/** Flip-through of an item's photos. Navigate with arrows, dots, thumbnails,
 *  ArrowLeft/Right, or a native swipe. Tapping the photo opens the shared ImageViewer
 *  (rotate + zoom) on the current photo. Each thumbnail's ··· offers Make cover
 *  and Delete; "+ Add photos" uploads through the pool straight onto this item. */
export function ItemPhotoCarousel({
  photos: incoming,
  collectionId,
  itemId,
  itemName,
}: ItemPhotoCarouselProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Local copy so Make cover / Delete respond instantly. A refresh that brings a
  // different list (new uploads, a server-promoted cover) re-seeds it in place —
  // never a remount, so an open uploader keeps its per-file status.
  const [photos, setPhotos] = useState(incoming);
  const [seen, setSeen] = useState(() => signature(incoming));
  if (signature(incoming) !== seen) {
    setSeen(signature(incoming));
    setPhotos(incoming);
  }
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // A swipe must not also count as the tap that opens the viewer.
  const swiped = useRef(false);
  const [viewing, setViewing] = useState(false);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingId) keepRef.current?.focus();
  }, [confirmingId]);

  const current = Math.min(index, Math.max(0, photos.length - 1));
  const go = (i: number) => setIndex(Math.min(photos.length - 1, Math.max(0, i)));

  // The strip's last button is always "+ Add photos", so there is always a focus home.
  const focusStrip = (i: number) =>
    requestAnimationFrame(() => {
      const buttons = stripRef.current?.querySelectorAll<HTMLElement>("[data-strip-focus]");
      if (buttons?.length) buttons[Math.min(i, buttons.length - 1)].focus();
    });

  const inFlight = useRef(false);
  async function send(request: () => Promise<Response>, done: () => void) {
    if (inFlight.current) return; // a double tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await request();
      if (!res.ok) throw new Error(`photo action failed: ${res.status}`);
      done();
      router.refresh();
    } catch {
      setError("That didn’t go through — your photo is safe; try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const makeCover = (p: CarouselPhoto) =>
    send(
      () =>
        fetch(`/api/collections/${collectionId}/items/${p.itemId}/photos/${p.id}/set-hero`, {
          method: "POST",
        }),
      () => {
        setPhotos((prev) => {
          const next = prev.map((q) => ({ ...q, isHero: q.id === p.id }));
          return [...next.filter((q) => q.id === p.id), ...next.filter((q) => q.id !== p.id)];
        });
        setIndex(0);
      },
    );

  const confirmDelete = (p: CarouselPhoto) => {
    const i = photos.findIndex((q) => q.id === p.id);
    return send(
      () =>
        fetch(`/api/collections/${collectionId}/items/${p.itemId}/photos/${p.id}`, {
          method: "DELETE",
        }),
      () => {
        setPhotos((prev) => prev.filter((q) => q.id !== p.id));
        // An earlier photo going shouldn't change which one is in view.
        if (i < current) setIndex(current - 1);
        setConfirmingId(null);
        focusStrip(i);
      },
    );
  };

  const confirming = photos.find((p) => p.id === confirmingId) ?? null;
  const confirmingPosition = photos.findIndex((p) => p.id === confirmingId) + 1;
  const cancelConfirm = () => {
    setConfirmingId(null);
    focusStrip(confirmingPosition - 1);
  };

  const strip = (
    <div className="mt-3">
      <ul ref={stripRef} aria-label="All photos" className="mx-auto flex w-fit max-w-full gap-2 overflow-x-auto p-1">
        {photos.map((p, i) => (
          <li key={p.id} className="relative shrink-0">
            <button
              type="button"
              data-strip-focus
              onClick={() => go(i)}
              aria-current={i === current}
              aria-label={`Show photo ${i + 1}${p.isHero ? " (cover)" : ""}`}
              className={`block h-20 w-20 overflow-hidden rounded-control ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === current ? "ring-primary" : "ring-transparent"}`}
            >
              <Image
                src={getPhotoAssetUrl(collectionId, p.itemId, p.id, {
                  w: 160,
                  v: new Date(p.updatedAt).getTime(),
                })}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="h-full w-full object-cover"
              />
            </button>
            {p.isHero && (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 left-1 rounded-pill bg-surface-raised px-2 py-0.5 text-xs text-ink ring-1 ring-rim"
              >
                Cover
              </span>
            )}
            <OverflowMenu
              label={`More for photo ${i + 1}`}
              compact
              className="absolute -right-1 -top-1"
              items={[
                ...(p.isHero
                  ? []
                  : [{ label: "Make cover", onSelect: () => makeCover(p), disabled: busy }]),
                { label: "Delete", onSelect: () => setConfirmingId(p.id), tone: "danger" as const },
              ]}
            />
          </li>
        ))}
        <li className="shrink-0">
          <button
            type="button"
            data-strip-focus
            aria-expanded={adding}
            aria-controls={adding ? "add-photos-panel" : undefined}
            onClick={() => setAdding((a) => !a)}
            className="flex h-20 w-20 flex-col items-center justify-center rounded-control border-2 border-dashed border-ink-soft text-sm text-ink transition-colors hover:bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden className="text-xl leading-none">
              +
            </span>
            Add photos
          </button>
        </li>
      </ul>

      {confirming && (
        <div
          role="group"
          aria-label={`Delete photo ${confirmingPosition}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelConfirm();
          }}
          className="mt-3 space-y-3 rounded-card bg-surface-raised p-4 ring-1 ring-hairline"
        >
          <p className="text-sm text-ink">Delete this photo? This can&apos;t be undone.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={keepRef}
              variant="secondary"
              disabled={busy}
              onClick={cancelConfirm}
            >
              Keep
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => confirmDelete(confirming)}>
              Delete photo
            </Button>
          </div>
        </div>
      )}

      <p role="alert" className="mt-2 text-sm text-error-deep empty:hidden">
        {error}
      </p>

      {adding && (
        <div id="add-photos-panel" className="mt-3">
          <PoolUpload collectionId={collectionId} attachToItemId={itemId} />
        </div>
      )}
    </div>
  );

  if (photos.length === 0) {
    return (
      <div>
        <div className="flex aspect-4/3 items-center justify-center rounded-card bg-card p-6 text-center ring-1 ring-hairline">
          <p className="text-ink-soft">
            Add photos whenever you like — they help you see what you love.
          </p>
        </div>
        {strip}
      </div>
    );
  }

  const photo = photos[current];
  const src = getPhotoAssetUrl(collectionId, photo.itemId, photo.id, {
    w: 1280,
    v: new Date(photo.updatedAt).getTime(),
  });
  const atStart = current === 0;
  const atEnd = current === photos.length - 1;
  const multi = photos.length > 1;

  return (
    <div>
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={`Photos of ${itemName}`}
        tabIndex={0}
        className="rounded-card outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        onKeyDown={(e) => {
          // React bubbles keys from the portalled zoom viewer through here.
          if (!e.currentTarget.contains(e.target as Node)) return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(current - 1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            go(current + 1);
          }
        }}
      >
        <div
          data-testid="carousel-stage"
          className="relative aspect-4/3 touch-pan-y overflow-hidden rounded-card bg-ground"
          onTouchStart={(e) => {
            // React bubbles touches from the portalled zoom viewer through here; only
            // a touch that is really on the stage counts as a swipe.
            const t = e.changedTouches[0];
            swiped.current = false;
            touchStart.current = e.currentTarget.contains(e.target as Node)
              ? { x: t.clientX, y: t.clientY ?? 0 }
              : null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (start === null) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = (t.clientY ?? 0) - start.y;
            // A mostly-vertical flick is a page scroll, not a swipe.
            if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
              swiped.current = true;
              go(dx < 0 ? current + 1 : current - 1);
            }
          }}
        >
          <Image
            key={photo.id}
            src={src}
            alt={photo.alt ?? itemName}
            fill
            unoptimized
            className="object-contain"
          />
          <button
            ref={viewButtonRef}
            type="button"
            aria-label="View photo"
            aria-haspopup="dialog"
            onClick={() => {
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              setViewing(true);
            }}
            className="absolute inset-0 z-10 cursor-zoom-in rounded-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span
              aria-hidden
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink ring-1 ring-ink/10 shadow-lift"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {multi && (
            <>
              <NavArrow
                side="left"
                label="Previous photo"
                disabled={atStart}
                onClick={() => go(current - 1)}
              />
              <NavArrow
                side="right"
                label="Next photo"
                disabled={atEnd}
                onClick={() => go(current + 1)}
              />
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
                    className="inline-flex h-11 w-11 items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
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
      {viewing && (
        <ImageViewer
          photo={photo}
          onClose={() => {
            setViewing(false);
            viewButtonRef.current?.focus();
          }}
        />
      )}
      {strip}
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
      className={`absolute top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink ring-1 ring-ink/10 shadow-lift transition-colors hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${side === "left" ? "left-3" : "right-3"} ${disabled ? "opacity-40" : ""}`}
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
