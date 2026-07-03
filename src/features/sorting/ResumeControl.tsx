"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";

// Picks a paused sort back up: marks the session active again and returns the
// person to where they left off. A primary action — resuming is the warm,
// affirming continuation of the work.
export function ResumeControl({
  sessionId,
  sortHref,
  onBusyChange,
  label = "Resume",
}: {
  sessionId: string;
  sortHref: string;
  // Optional: lets a parent (the collection card) disable its sibling "Set aside"
  // while a resume PATCH is in flight, so the two can't fire concurrently on the
  // same session. Standalone callers (the sort landing) simply omit it.
  onBusyChange?: (busy: boolean) => void;
  // Idle button text. Defaults to "Resume" (the sort landing). The governed
  // workspace surface (spec §9) passes "Resume sorting".
  label?: string;
}) {
  const router = useRouter();

  return (
    <AsyncActionButton
      label={label}
      variant="primary"
      onBusyChange={onBusyChange}
      action={async () => {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        if (!res.ok) throw new Error("resume failed");
        router.push(sortHref); // back to where they left off (this island then unmounts)
      }}
    />
  );
}
