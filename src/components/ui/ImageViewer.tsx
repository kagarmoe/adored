"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getPhotoAssetUrl } from "@/lib/photos";

export interface ViewerPhoto {
  id: string;
  /** Item-assigned photos only (covers/heroes) — the only photos the viewer opens. */
  itemId: string;
  collectionId: string;
  rotation: number;
  updatedAt: string | Date;
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

/** Tap-first photo lightbox: zoom (+/-), drag-to-pan when zoomed, and persisted
 *  rotate. No swipe. Standard modal idiom (scrim + bg-surface panel). Portaled to <body> so
 *  the card's `isolate` stacking context can't trap it. */
export function ImageViewer({ photo, onClose }: { photo: ViewerPhoto; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(photo.rotation);
  const [version, setVersion] = useState(() => new Date(photo.updatedAt).getTime());
  const [optimisticDeg, setOptimisticDeg] = useState(0); // CSS turn until the rotated bytes load
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = getPhotoAssetUrl(photo.collectionId, photo.itemId, photo.id, { w: 1280, v: version });
  const patchUrl = `/api/collections/${photo.collectionId}/items/${photo.itemId}/photos/${photo.id}`;

  const zoomTo = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale(clamped);
    if (clamped <= MIN_SCALE) setPan({ x: 0, y: 0 }); // panning only matters while zoomed
  };

  // Drag-to-pan (pointer events → mouse + touch). Only meaningful while zoomed in.
  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= MIN_SCALE) return;
    dragOrigin.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragOrigin.current) return;
    setPan({ x: e.clientX - dragOrigin.current.x, y: e.clientY - dragOrigin.current.y });
  };
  const endPan = () => {
    dragOrigin.current = null;
  };

  const rotate = async () => {
    if (busy) return;
    const next = (rotation + 90) % 360;
    setOptimisticDeg((d) => d + 90); // instant visual feedback
    setBusy(true);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rotation: number; updatedAt: string };
      setRotation(data.rotation);
      setVersion(new Date(data.updatedAt).getTime()); // new src → the rotated bytes load (onLoad clears the CSS turn)
      setStatus(`Rotated to ${data.rotation} degrees`);
      router.refresh();
    } catch {
      setOptimisticDeg((d) => d - 90); // revert the optimistic turn
      setStatus("We couldn't rotate that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-ground" onClick={onClose} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Photo"
        tabIndex={-1}
        className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 rounded-card bg-surface p-4 shadow-raised outline-hidden"
      >
        <div
          className="relative flex-1 overflow-hidden rounded-card bg-ground"
          style={{ minHeight: "50vh", touchAction: scale > MIN_SCALE ? "none" : "auto", cursor: scale > MIN_SCALE ? "grab" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <Image
            key={version}
            src={src}
            alt={photo.alt ?? "Photo"}
            fill
            unoptimized
            draggable={false}
            className="object-contain transition-transform motion-reduce:transition-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${optimisticDeg}deg) scale(${scale})` }}
            onLoad={() => {
              if (optimisticDeg !== 0) setOptimisticDeg(0);
            }}
          />
        </div>

        <div className="flex items-center justify-center gap-2">
          <ViewerButton label="Zoom out" disabled={scale <= MIN_SCALE} onClick={() => zoomTo(scale - STEP)}>−</ViewerButton>
          <ViewerButton label="Zoom in" disabled={scale >= MAX_SCALE} onClick={() => zoomTo(scale + STEP)}>+</ViewerButton>
          <ViewerButton label="Rotate photo" disabled={busy} onClick={rotate}>↻</ViewerButton>
          <ViewerButton label="Close" onClick={onClose}>✕</ViewerButton>
        </div>

        <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-ink-soft">
          {status}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-control bg-surface-raised px-3 text-lg text-ink shadow-lift transition-colors hover:bg-ground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}
