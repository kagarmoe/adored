"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "@/features/sorting/AsyncActionButton";
import { patchSessionStatus } from "@/features/sorting/sessionStatusPatch";

interface KeepSortingButtonProps {
  /** ULID collection.id (the sessions API never takes the slug). */
  collectionId: string;
  curatorId: string;
  sortHref: string;
  session: { id: string; status: "active" | "paused" } | null;
}

// The collection's one sort action (spec §4.1): "Keep sorting" resumes the open
// sort (reactivating a paused one); otherwise "Start sorting" opens a new one with
// the server's defaults. A 409 means a sort was opened elsewhere — just join it.
export function KeepSortingButton({ collectionId, curatorId, sortHref, session }: KeepSortingButtonProps) {
  const router = useRouter();
  return (
    <AsyncActionButton
      label={session ? "Keep sorting" : "Start sorting"}
      variant="primary"
      action={async () => {
        if (session?.status === "paused") {
          const res = await patchSessionStatus({ curatorId, sessionId: session.id }, "active");
          if (!res.ok) throw new Error("resume");
        } else if (session === null) {
          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collectionId }),
          });
          if (!res.ok && res.status !== 409) throw new Error("start");
        }
        router.push(sortHref); // stays busy through the navigation
      }}
    />
  );
}
