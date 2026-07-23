"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface RemovedItemNoticeProps {
  itemId: string;
  /** The items-list path without query — Done/undo strip the ?removed param via replace. */
  itemsHref: string;
}

// The undo half of the remove flow (spec 2026-07-23 rev 2): the details page's
// ItemDeleteControl lands here with ?removed=<id>; this notice announces the
// removal (role=status → aria-live for AT) and offers the existing restore
// endpoint as an immediate way back. Focus is not stolen; a stale/foreign id
// just 404s into the gentle retry line.
export function RemovedItemNotice({ itemId, itemsHref }: RemovedItemNoticeProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function restore() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("restore failed");
      router.replace(itemsHref);
      router.refresh();
    } catch {
      setError("That didn’t go through — try again.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-card bg-surface p-4 ring-1 ring-hairline sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm text-ink">
        Removed. It can come back if you change your mind.
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={restore} disabled={busy}>
          {busy ? "Bringing it back…" : "Bring it back"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => router.replace(itemsHref)} disabled={busy}>
          Done
        </Button>
      </div>
      {error && <span className="text-sm text-error-deep">{error}</span>}
    </div>
  );
}
