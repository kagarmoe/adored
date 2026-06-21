"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// The dashboard's "Abandon" affordance. Two-step (reveal → confirm) so a stray
// tap can't drop an in-progress sort; on confirm it DELETEs the session (the
// route soft-deletes, so it leaves every session view) and refreshes the page.
export function AbandonSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function abandon() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh();
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Abandon
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink">Abandon this session?</span>
        <Button
          variant="secondary"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={busy}
        >
          Keep going
        </Button>
        <Button onClick={abandon} disabled={busy}>
          {busy ? "Abandoning…" : "Abandon"}
        </Button>
      </div>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
