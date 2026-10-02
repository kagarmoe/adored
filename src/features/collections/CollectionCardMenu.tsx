"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OverflowMenu, type OverflowMenuItem } from "@/components/ui";

interface CollectionCardMenuProps {
  /** ULID — the archive/restore routes take the id, never the slug. */
  collectionId: string;
  name: string;
  /** `/collections/{slug ?? id}`. */
  href: string;
  archived: boolean;
  /** The list's current search, kept across the landing. */
  q: string;
}

// Rendered for the owner only: every action here is collection:manage server-side.
// Archive is the existing reversible status flip; its Undo waits on the list
// (ArchivedNotice, keyed by ?removed=). Bring back lands on the same Archived view with
// a focused "Brought back" line (BroughtBackNotice, keyed by ?restored=) — the card
// leaves the list, so a bare refresh would drop focus silently. Permanent delete stays
// on the settings page.
export function CollectionCardMenu({ collectionId, name, href, archived, q }: CollectionCardMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(action: "archive" | "restore") {
    setBusy(true);
    setFailed(false);
    // Literal paths (not `/${action}`) so the UI-route connectivity scan can verify both wires.
    const res = await (action === "archive"
      ? fetch(`/api/collections/${collectionId}/archive`, { method: "POST" })
      : fetch(`/api/collections/${collectionId}/restore`, { method: "POST" })
    ).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    const p = new URLSearchParams();
    if (action === "restore") p.set("status", "archived");
    if (q) p.set("q", q);
    p.set(action === "archive" ? "removed" : "restored", collectionId);
    router.push(`/collections?${p}`);
  }

  const items: OverflowMenuItem[] = [
    { label: "Collection settings", onSelect: () => router.push(`${href}/edit`) },
    { label: "Members", onSelect: () => router.push(`${href}/members`) },
    archived
      ? { label: "Bring back", onSelect: () => void post("restore"), disabled: busy }
      : { label: "Archive", onSelect: () => void post("archive"), disabled: busy },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      {/* compact: a raised 28px chip over the cover photo, 44px hit area */}
      <OverflowMenu label={`More for ${name}`} items={items} compact />
      {failed && (
        <p role="alert" className="rounded-control bg-surface-raised px-3 py-1 text-sm text-ink shadow-lift">
          That didn’t go through. Try again.
        </p>
      )}
    </div>
  );
}
