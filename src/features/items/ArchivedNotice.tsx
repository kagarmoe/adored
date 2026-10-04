"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";
import { isIdShaped } from "@/lib/id";

interface ArchivedNoticeProps {
  kind: "item" | "collection";
  id: string;
}

// The undo half of the archive flow (an item from its panel, a collection from its card):
// the archiving surface lands on the list with ?removed=<id>; this notice
// offers the existing restore endpoint as an immediate way back. Focus moves to
// the notice on mount — an aria-live region server-rendered into a freshly
// navigated page is NOT announced (live regions announce mutations, not initial
// content), so the focus move is what tells an AT user the archive happened and
// where the way back is. Dismissing strips only the `removed` param, so any
// co-present filters (?status=…) survive. A stale/foreign id just 404s into the
// gentle retry line. The restore URL is built HERE from kind + an id-shaped, encoded id —
// never passed in — so a hostile ?removed= (e.g. "../collections/x/archive#") renders
// nothing and cannot aim Undo at another route.
// The copy points at the Archived pill, one tap away on this list.
export function ArchivedNotice({ kind, id }: ArchivedNoticeProps) {
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

  // The notice unmounts as the URL loses ?removed=; focus goes to the list's heading
  // first so it is never dropped to <body>.
  function leave() {
    router.replace(hrefWithoutRemoved());
    document.querySelector<HTMLElement>("main h1")?.focus();
  }

  async function restore() {
    const safe = encodeURIComponent(id);
    // Literal paths (not a joined segment) so the UI-route connectivity scan can verify both wires.
    const res =
      kind === "item"
        ? await fetch(`/api/items/${safe}/restore`, { method: "POST" })
        : await fetch(`/api/collections/${safe}/restore`, { method: "POST" });
    if (!res.ok) throw new Error("restore failed");
    leave();
  }

  // Defense in depth behind each page's own check.
  if (!isIdShaped(id)) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      className="flex flex-col gap-3 rounded-card bg-glass p-4 ring-1 ring-rim focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm text-ink">
        Archived. You&rsquo;ll find it under Archived.
      </span>
      <div className="flex items-center gap-2">
        <AsyncActionButton
          action={restore}
          label="Undo"
          busyLabel="Bringing it back…"
        />
        <Button variant="ghost" onClick={leave}>
          Done
        </Button>
      </div>
    </div>
  );
}
