"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";
import { patchSessionStatus } from "./sessionStatusPatch";

// Spec §4.2: Pause returns home with the sort paused; nothing is lost and Keep
// sorting picks it up. No confirm — stepping away is reversible (TONE). The PATCH
// best-effort pre-flushes queued answers but never waits on a slow network.
export function PauseControl({
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
      label="Pause"
      align="end"
      ariaLabel="Pause — your place is kept"
      action={async () => {
        const res = await patchSessionStatus({ curatorId, sessionId }, "paused");
        if (!res.ok) throw new Error("pause failed");
        router.push(collectionHref);
      }}
    />
  );
}
