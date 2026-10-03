"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";

interface DeleteCollectionSectionProps {
  collectionId: string;
  collectionName: string;
}

// Owner-only permanent delete for a whole collection. Render only for the owner
// (the purge route is owner-gated). Strong guard: the user must type the exact
// collection name, matching POST /api/collections/[id]/purge's confirm contract.
export function DeleteCollectionSection({
  collectionId,
  collectionName,
}: DeleteCollectionSectionProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = typed === collectionName;

  // When the confirm step appears, move focus into the name field so a keyboard
  // user isn't dropped and a screen reader announces the new step.
  useEffect(() => {
    if (confirming) inputRef.current?.focus();
  }, [confirming]);

  async function purge() {
    if (inFlight.current || !matches) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      if (!res.ok) throw new Error("purge failed");
      // The collection is gone — leave the now-dead page.
      router.push("/collections");
      router.refresh();
    } catch {
      setError("That didn’t go through — your collection is safe; try again in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <Card variant="danger" padding="lg" className="mt-10">
      <h2 className="text-lg text-ink">Delete this collection</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Permanently removes this collection and everything in it — items, photos, and sorts. This
        can’t be undone.
      </p>

      {!confirming ? (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          Delete this collection
        </Button>
      ) : (
        <div role="group" aria-label="Delete this collection" className="mt-4 flex flex-col gap-3">
          <label htmlFor="confirm-delete-collection" className="text-sm text-ink">
            Type <span className="font-semibold">{collectionName}</span> to confirm
          </label>
          <Input
            id="confirm-delete-collection"
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label={`Type ${collectionName} to confirm`}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={purge} disabled={busy || !matches}>
              {busy ? "Deleting…" : "Delete collection"}
            </Button>
          </div>
          {error && (
            <span role="status" className="text-sm text-error-deep">
              {error}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
