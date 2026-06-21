"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// The dashboard's "set this sorting aside" affordance. Two-step (reveal →
// confirm) so a stray tap can't drop an in-progress sort; on confirm it DELETEs
// the session (the route soft-deletes, so it leaves every session view) and
// refreshes the page. Gentle, reversible framing per TONE.md (not "Abandon").
export function AbandonSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  // Move focus to the safe default (cancel) when the confirm appears, so a
  // keyboard user isn't dropped to <body> and a screen reader announces it.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function setAside() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh(); // success unmounts this island with the active-session card
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Set aside
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Set this session aside"
      className="flex flex-col items-start gap-1 sm:items-end"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink">Set this session aside?</span>
        <Button
          ref={cancelRef}
          variant="secondary"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={busy}
        >
          Never mind
        </Button>
        <Button onClick={setAside} disabled={busy}>
          {busy ? "Setting aside…" : "Set aside"}
        </Button>
      </div>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
