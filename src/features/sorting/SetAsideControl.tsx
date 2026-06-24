"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// The triage "Not mine" affordance: a single quiet tap records that this item
// isn't the person's to decide (a `set_aside` disposition) and refreshes so the
// next item comes forward. Set-aside items drop out of the triage queue, so a
// mistaken tap needs an escape — hence the persistent inline undo below.
//
// The undo must survive `router.refresh()`. This component is rendered UN-KEYED
// in the triage page, so when the page refreshes and the next item arrives via
// new props, React keeps THIS instance and the `undo` state persists. The
// "Bring back" notice for the item just set aside therefore lingers over the
// next item until the person either brings it back or sets another one aside
// (which replaces the undo). There is deliberately no auto-dismiss timer — a
// countdown reads as a deadline, and this is a gentle escape, not a race
// (TONE.md, commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions
// API authorizes the item then asserts item.collectionId === params.id, which
// is always a ULID — a slug there 404s.
export function SetAsideControl({
  collectionId,
  itemId,
  itemName,
}: {
  collectionId: string;
  itemId: string;
  itemName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{ itemId: string; name: string | null } | null>(null);
  const inFlight = useRef(false);

  async function setAside() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, disposition: "set_aside" }),
      });
      if (!res.ok) throw new Error("set aside failed");
      // Replace any prior undo with the item just set aside, then refresh: the
      // un-keyed mount keeps this state alive so the notice rides over the
      // next item.
      setUndo({ itemId, name: itemName });
      router.refresh();
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function bringBack() {
    if (!undo || inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions/${undo.itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("bring back failed");
      setUndo(null);
      router.refresh(); // the item returns to the queue and resurfaces
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="ghost"
        onClick={setAside}
        disabled={busy}
        title="set aside — not mine to decide"
        aria-label="Not mine — set aside, not mine to decide"
      >
        {busy ? "Just a moment…" : "Not mine"}
      </Button>
      {undo && (
        <p role="status" className="text-sm text-ink-soft">
          Set aside —{" "}
          {undo.name ? <span className="text-ink">{undo.name}</span> : "this one"}{" "}
          ·{" "}
          <button
            type="button"
            onClick={bringBack}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-sm"
          >
            Bring back
          </button>
        </p>
      )}
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
