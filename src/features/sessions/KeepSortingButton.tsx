"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { patchSessionStatus } from "@/features/sorting/sessionStatusPatch";

interface KeepSortingButtonProps {
  /** ULID collection.id (the sessions API never takes the slug). */
  collectionId: string;
  curatorId: string;
  sortHref: string;
  session: { id: string; status: "active" | "paused" } | null;
}

const STUMBLE = "That didn't go through — give it another try in a moment.";

// The collection's one sort action (spec §4.1): "Keep sorting" resumes the open
// sort (reactivating a paused one); otherwise "Start sorting" opens a new one with
// the server's defaults. A 409 means a sort was opened elsewhere — just join it.
export function KeepSortingButton({ collectionId, curatorId, sortHref, session }: KeepSortingButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function go() {
    setBusy(true);
    setMessage("");
    try {
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
      router.push(sortHref); // stays disabled through the navigation
    } catch {
      setMessage(STUMBLE);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={go} disabled={busy} className="w-full sm:w-auto">
        {session ? "Keep sorting" : "Start sorting"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
