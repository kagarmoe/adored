"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";
import { patchSessionStatus } from "./sessionStatusPatch";

// Always-available escape from the sort chrome: one quiet tap pauses the session
// and returns the person to the calm landing, where their sort waits for them.
// Pausing is reversible and low-stakes, so there's no confirm step — a gate here
// would make stepping away feel watched (TONE.md, commitment 4). The copy speaks
// from the person's side ("Take a break" / "I need a moment"), never the machine's.
//
// The PATCH rides the shared helper, which best-effort pre-flushes the decision
// queue first (bounded — F8): answers already given try to land now, but the
// pause and the navigation NEVER wait on a stumbling network.
export function TakeABreakControl({
  curatorId,
  sessionId,
  collectionHref,
}: {
  curatorId: string;
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
        const res = await patchSessionStatus({ curatorId, sessionId }, "paused");
        if (!res.ok) throw new Error("pause failed");
        router.push(`${collectionHref}/sort`); // the calm landing reflects the paused sort
      }}
    />
  );
}
