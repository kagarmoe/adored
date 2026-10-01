"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";

export function BringBackButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  return (
    <AsyncActionButton
      label="Bring back"
      busyLabel="Bringing it back…"
      action={async () => {
        const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
        if (!res.ok) throw new Error("restore failed");
        router.refresh();
      }}
    />
  );
}
