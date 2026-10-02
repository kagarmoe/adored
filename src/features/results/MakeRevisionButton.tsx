"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Spec §4.4: a saved ranking stays as it is; "Make a revision" opens a copy (pinned
// to the saved order) on the live Ranking, where saving it issues its own link.
export function MakeRevisionButton({ resultId, rankingHref }: { resultId: string; rankingHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function revise() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sort-results/${resultId}/supersede`, { method: "POST" });
      if (!res.ok) throw new Error("supersede");
      router.push(rankingHref);
    } catch {
      setError("That didn't open just now — nothing was lost. Try again whenever you like.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" onClick={revise} disabled={busy}>
        {busy ? "Getting ready…" : "Make a revision"}
      </Button>
      {error && (
        <p role="status" className="text-sm text-ink-soft">
          {error}
        </p>
      )}
    </div>
  );
}
