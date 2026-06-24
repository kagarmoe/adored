"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Picks a paused sort back up: marks the session active again and returns the
// person to where they left off. A primary action — resuming is the warm,
// affirming continuation of the work. In-flight guard mirrors DeferControl so
// a double-tap sends one PATCH.
export function ResumeControl({
  sessionId,
  sortHref,
  onBusyChange,
}: {
  sessionId: string;
  sortHref: string;
  // Optional: lets a parent (the collection card) disable its sibling "Set aside"
  // while a resume PATCH is in flight, so the two can't fire concurrently on the
  // same session. Standalone callers (the sort landing) simply omit it.
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function resume() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("resume failed");
      router.push(sortHref); // back to where they left off (this island then unmounts)
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      onBusyChange?.(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" onClick={resume} disabled={busy}>
        {busy ? "Just a moment…" : "Resume"}
      </Button>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
