"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// The "Set aside" list's per-row reversal: a single quiet tap brings an item back
// from set-aside (deletes its `set_aside` disposition) and refreshes so the row
// leaves the list. The DELETE is idempotent (route returns 200 either way), so a
// double-tap is harmless — the in-flight guard still collapses it to one request,
// mirroring DeferControl/SetAsideControl. A gentle, non-alarming error notice on
// failure; no confirm step — bringing back is reversible and low-stakes (TONE.md,
// commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions API
// authorizes the item then asserts item.collectionId === params.id, which is
// always a ULID — a slug there 404s.
export function BringBackControl({
  collectionId,
  itemId,
}: {
  collectionId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function bringBack() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("bring back failed");
      router.refresh(); // the row leaves the list; the item returns to the queue
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        onClick={bringBack}
        disabled={busy}
        title="bring this one back"
        aria-label="Bring back — return this one to your decisions"
      >
        {busy ? "Just a moment…" : "Bring back"}
      </Button>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
