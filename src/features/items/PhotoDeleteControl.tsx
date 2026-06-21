"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface PhotoDeleteControlProps {
  collectionId: string;
  itemId: string;
  photoId: string;
  /** Called after a confirmed, successful delete so the parent can drop it. */
  onDeleted: () => void;
  className?: string;
}

// Delete-the-photo-you're-looking-at control for the item carousel. Two-step
// (reveal → confirm) so a stray tap can't drop a photo; on confirm it DELETEs
// the photo and hands control back to the parent via onDeleted.
export function PhotoDeleteControl({
  collectionId,
  itemId,
  photoId,
  onDeleted,
  className,
}: PhotoDeleteControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function remove() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/collections/${collectionId}/items/${itemId}/photos/${photoId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      onDeleted();
    } catch {
      setError("That didn’t go through — your photo is safe; try again.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Delete this photo"
        onClick={() => setConfirming(true)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-lift ring-1 ring-ink/10 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Delete this photo"
      className={`flex max-w-[15rem] flex-col gap-2 rounded-card bg-surface p-3 shadow-lift ring-1 ring-hairline ${className ?? ""}`}
    >
      <span className="text-sm text-ink">Delete this photo? This can’t be undone.</span>
      <div className="flex gap-2">
        <Button
          ref={cancelRef}
          size="sm"
          variant="secondary"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={busy}
        >
          Keep
        </Button>
        <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {error && (
        <span role="status" className="text-sm text-error-deep">
          {error}
        </span>
      )}
    </div>
  );
}
