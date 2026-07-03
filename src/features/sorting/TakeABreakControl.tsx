"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";

// Always-available escape from the sort chrome: one quiet tap pauses the session
// and returns the person to the calm landing, where their sort waits for them.
// Pausing is reversible and low-stakes, so there's no confirm step — a gate here
// would make stepping away feel watched (TONE.md, commitment 4). The copy speaks
// from the person's side ("Take a break" / "I need a moment"), never the machine's.
export function TakeABreakControl({
  sessionId,
  collectionHref,
}: {
  sessionId: string;
  collectionHref: string;
}) {
  const router = useRouter();

  return (
    <AsyncActionButton
      label="Take a break"
      align="end"
      title="I need a moment"
      ariaLabel="Take a break — I need a moment"
      action={async () => {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "paused" }),
        });
        if (!res.ok) throw new Error("pause failed");
        router.push(`${collectionHref}/sort`); // the calm landing reflects the paused sort
      }}
    />
  );
}
