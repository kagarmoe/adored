"use client";

import { useEffect } from "react";
import { patchSessionStatus } from "./sessionStatusPatch";

// A paused sort opened by URL (or a stale tab) reads "paused" everywhere else, so
// it is tidied back to active on mount — never during the server render, where a
// link prefetch would un-pause it. Best-effort: answers land on a paused sort too.
export function ResumeOnLoad({ curatorId, sessionId }: { curatorId: string; sessionId: string }) {
  useEffect(() => {
    patchSessionStatus({ curatorId, sessionId }, "active").catch(() => undefined);
  }, [curatorId, sessionId]);
  return null;
}
