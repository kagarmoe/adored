"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getPhotoAssetUrl } from "@/lib/photos";

export interface ViewerPhoto {
  id: string;
  itemId: string | null;
  collectionId: string;
  rotation: number;
  updatedAt: string | Date;
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

/** Tap-first photo lightbox: zoom (+/-) and persisted rotate. No swipe.
 *  Reuses the ConfirmDialog modal idiom (scrim + bg-surface panel). */
export function ImageViewer({ photo, onClose }: { photo: ViewerPhoto; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(photo.rotation);
  const [version, setVersion] = useState(() => new Date(photo.updatedAt).getTime());
  const [optimisticDeg, setOptimisticDeg] = useState(0); // CSS turn until the rotated bytes load
  const [scale, setScale] = useState(MIN_SCALE);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  // Focus the panel on open; Escape closes; Tab is trapped within the dialog.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
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

  const patchUrl = photo.itemId
    ? `/api/collections/${photo.collectionId}/items/${photo.itemId}/photos/${photo.id}`
    : `/api/collections/${photo.collectionId}/pool/photos/${photo.id}`;

  // itemId-scoped surfaces use the item file URL; pool photos can't (helper throws).
  const src = photo.itemId
    ? getPhotoAssetUrl(photo.collectionId, photo.itemId, photo.id, { w: 1280, v: version })
    : `/api/collections/${photo.collectionId}/pool/photos/${photo.id}/file?w=1280&v=${version}`;

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
      setVersion(new Date(data.updatedAt).getTime()); // new src -> the rotated bytes load
      setStatus(`Rotated to ${data.rotation} degrees`);
      router.refresh(); // re-render the card behind the viewer with the new orientation
    } catch {
      setOptimisticDeg((d) => d - 90); // revert the optimistic turn
      setStatus("We couldn't rotate that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Portal to <body>: card surfaces create stacking contexts (isolate), which
  // would otherwise trap this fixed overlay beneath the page content.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Photo"
        tabIndex={-1}
        className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 rounded-card bg-surface p-4 shadow-raised outline-none"
      >
        <div className="relative flex-1 overflow-hidden rounded-card bg-ground" style={{ minHeight: "50vh" }}>
          <Image
            key={version}
            src={src}
            alt={photo.alt ?? "Photo"}
            fill
            unoptimized
            className="object-contain transition-transform motion-reduce:transition-none"
            style={{ transform: `rotate(${optimisticDeg}deg) scale(${scale})` }}
            onLoad={() => setOptimisticDeg(0)}
          />
        </div>

        <div className="flex items-center justify-center gap-2">
          <ViewerButton label="Zoom out" disabled={scale <= MIN_SCALE} onClick={() => setScale((s) => Math.max(MIN_SCALE, s - STEP))}>−</ViewerButton>
          <ViewerButton label="Zoom in" disabled={scale >= MAX_SCALE} onClick={() => setScale((s) => Math.min(MAX_SCALE, s + STEP))}>+</ViewerButton>
          <ViewerButton label="Rotate photo" disabled={busy} onClick={rotate}>↻</ViewerButton>
          <ViewerButton label="Close" onClick={onClose}>✕</ViewerButton>
        </div>

        <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm text-ink-soft">
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
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-control bg-surface-raised px-3 text-lg text-ink shadow-lift transition-colors hover:bg-ground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
