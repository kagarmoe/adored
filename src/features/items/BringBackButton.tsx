"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";

export function BringBackButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  // A bordered secondary pill: its visible edge lines up with the card's name column (p-3)
  // where a ghost's text sat 16px inset. px-3 (not the default px-4) so the busy label fits a
  // 390px two-column card on one line; the important modifier beats Button's px-4 regardless of CSS order.
  return (
    <AsyncActionButton
      label="Bring back"
      busyLabel="One moment…"
      variant="secondary"
      className="px-3!"
      action={async () => {
        const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
        if (!res.ok) throw new Error("restore failed");
        router.refresh();
      }}
    />
  );
}
