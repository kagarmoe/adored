"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";

// Spec §4.4: a saved ranking stays as it is; "Make a revision" opens a copy (pinned
// to the saved order) on the Ranking, where saving it issues its own link.
// When the Ranking holds hand placements the copy would move, the server
// answers 409 with the count and the person chooses (purses-w7ss.5).
type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "asking"; pinCount: number };

function revisionNote(pinCount: number): string {
  return pinCount === 1
    ? "You've moved 1 piece by hand on your ranking. A revision sets your ranking back to this saved order, so that move won't be kept."
    : `You've moved ${pinCount} pieces by hand on your ranking. A revision sets your ranking back to this saved order, so those moves won't be kept.`;
}

export function MakeRevisionButton({ resultId, rankingHref }: { resultId: string; rankingHref: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (phase.kind === "asking") note.current?.focus();
    if (phase.kind === "idle" && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [phase.kind]);

  async function revise(discardPins: boolean) {
    setPhase({ kind: "busy" });
    setError("");
    try {
      const res = await fetch(`/api/sort-results/${resultId}/supersede`, {
        method: "POST",
        ...(discardPins
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ discardPins: true }) }
          : {}),
      });
      if (res.status === 409) {
        const body: unknown = await res.json().catch(() => null);
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          body.code === "revision_discards_pins" &&
          "pinCount" in body &&
          typeof body.pinCount === "number"
        ) {
          setPhase({ kind: "asking", pinCount: body.pinCount });
          return;
        }
      }
      if (!res.ok) throw new Error("supersede");
      router.push(rankingHref);
    } catch {
      // A failed confirm unmounts the note; send focus back to the trigger, not <body>.
      if (discardPins) returnFocus.current = true;
      setError("That didn't open just now — nothing was lost. Try again whenever you like.");
      setPhase({ kind: "idle" });
    }
  }

  if (phase.kind === "asking") {
    return (
      <div
        role="group"
        aria-label="Before you revise"
        className="flex max-w-prose flex-col items-start gap-3 rounded-control border border-hairline bg-surface px-4 py-3"
      >
        <p ref={note} tabIndex={-1} className="text-sm text-ink focus:outline-hidden">
          {revisionNote(phase.pinCount)}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* secondary, not primary: the page's one primary is SharePanel's "Create link". */}
          <Button type="button" variant="secondary" onClick={() => revise(true)}>
            Start the revision
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              returnFocus.current = true;
              setPhase({ kind: "idle" });
            }}
          >
            Keep my ranking
          </Button>
        </div>
        <Link href={rankingHref} className={`${quietLink} text-sm`}>
          See your ranking first
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button ref={trigger} type="button" variant="secondary" onClick={() => revise(false)} disabled={phase.kind === "busy"}>
        {phase.kind === "busy" ? "Getting ready…" : "Make a revision"}
      </Button>
      {error && (
        <p role="status" className="text-sm text-ink-soft">
          {error}
        </p>
      )}
    </div>
  );
}
