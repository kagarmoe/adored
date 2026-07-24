"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";

interface RemovedItemNoticeProps {
  itemId: string;
}

// The undo half of the remove flow (spec 2026-07-23 rev 2): the details page's
// ItemDeleteControl lands on the items list with ?removed=<id>; this notice
// offers the existing restore endpoint as an immediate way back. Focus moves to
// the notice on mount — an aria-live region server-rendered into a freshly
// navigated page is NOT announced (live regions announce mutations, not initial
// content), so the focus move is what tells an AT user the removal happened and
// where the way back is. Dismissing strips only the `removed` param, so any
// co-present filters (?status=…) survive. A stale/foreign id just 404s into the
// gentle retry line.
export function RemovedItemNotice({ itemId }: RemovedItemNoticeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function hrefWithoutRemoved() {
    const params = new URLSearchParams(searchParams);
    params.delete("removed");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  async function restore() {
    const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
    if (!res.ok) throw new Error("restore failed");
    router.replace(hrefWithoutRemoved());
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      className="flex flex-col gap-3 rounded-card bg-surface p-4 ring-1 ring-hairline outline-hidden sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm text-ink">
        Removed. It can come back if you change your mind.
      </span>
      <div className="flex items-center gap-2">
        <AsyncActionButton
          action={restore}
          label="Bring it back"
          busyLabel="Bringing it back…"
        />
        <Button variant="ghost" onClick={() => router.replace(hrefWithoutRemoved())}>
          Done
        </Button>
      </div>
    </div>
  );
}
