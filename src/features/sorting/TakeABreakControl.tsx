"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Always-available escape from the sort chrome: one quiet tap pauses the session
// and returns the person to the calm landing, where their sort waits for them.
// Pausing is reversible and low-stakes, so there's no confirm step — a gate here
// would make stepping away feel watched (TONE.md, commitment 4). The copy speaks
// from the person's side ("Take a break" / "I need a moment"), never the machine's.
// In-flight guard mirrors DeferControl so a double-tap sends one PATCH.
export function TakeABreakControl({
  sessionId,
  collectionHref,
}: {
  sessionId: string;
  collectionHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function takeABreak() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      if (!res.ok) throw new Error("pause failed");
      router.push(`${collectionHref}/sort`); // the calm landing reflects the paused sort
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        onClick={takeABreak}
        disabled={busy}
        title="I need a moment"
        aria-label="Take a break — I need a moment"
      >
        {busy ? "Just a moment…" : "Take a break"}
      </Button>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
