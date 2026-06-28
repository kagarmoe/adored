"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { ResumeControl } from "@/features/sorting/ResumeControl";

// The collection landing page's active-session affordance, restructured so the
// "set aside" undo SURVIVES the refresh that makes the session disappear.
//
// The PR2 lesson (TriageUndoProvider): a persistent undo rendered INSIDE the
// `{activeSession && <Card/>}` conditional is destroyed the instant the
// condition flips — after set-aside, activeSession becomes null and the card
// unmounts, taking any undo notice with it. So this island is mounted
// UNCONDITIONALLY by the page (it is NOT wrapped in `{activeSession && …}`).
// It holds the `undo` state itself and decides internally whether to show the
// session card or the persistent undo notice. When `session` flips to null on
// the post-set-aside refresh, the island stays mounted and `undo` rides over it.
//
// There is deliberately no auto-dismiss timer — a countdown reads as a deadline,
// and this is a gentle, reversible escape (TONE.md, Commitment 4).

interface SessionSummary {
  id: string;
  number: number | null;
  goal: string | null;
  status: "active" | "paused";
}

export function ActiveSessionPanel({
  session,
  resumeHref,
}: {
  session: SessionSummary | null;
  resumeHref: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  // A restore that 409s is terminal: a newer sort now holds the slot, so this
  // set-aside one can't come back. We render ONE settled voice (no live Undo)
  // instead of contradicting the undo invite with an error beside it.
  const [settled, setSettled] = useState(false);
  // True while the paused ResumeControl's PATCH is in flight — disables the
  // sibling "Set aside" so a resume and a set-aside can't race on the same row.
  const [resumeBusy, setResumeBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  // Move focus to the safe default (Never mind) when the confirm appears, so a
  // keyboard user isn't dropped to <body> and a screen reader announces it.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function setAside() {
    if (!session || inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      // Record the undo BEFORE refreshing: the refresh flips activeSession to
      // null upstream, re-rendering this island with session={null}. Because the
      // island stays mounted, `undo` survives and the notice persists.
      setUndo(session.id);
      setConfirming(false);
      router.refresh();
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function bringBack() {
    if (!undo || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${undo}/restore`, { method: "POST" });
      // 409: a newer in-progress sort now holds the slot, so this set-aside one
      // can't come back. Settle into ONE voice — no live Undo to click (it would
      // only 409 again). There is nothing to refresh to.
      if (res.status === 409) {
        setSettled(true);
        return;
      }
      if (!res.ok) throw new Error("restore failed");
      setUndo(null);
      router.refresh(); // the restored session reappears as the card
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  // A 409 on restore is terminal — render a SINGLE settled state, no live Undo
  // (it would only 409 again) and no contradicting error beside the invite. This
  // MUST take precedence over the undo-invite block below.
  if (settled) {
    return (
      <p role="status" className="text-sm text-ink-soft">
        Set aside. You&rsquo;ve started a new sort since, so this one stays put.
      </p>
    );
  }

  // Persistent undo takes precedence: once set aside, show the undo notice (and
  // any error) rather than the card, even if a stale session prop is still here
  // for the render between set-aside and the refresh landing.
  if (undo) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="status" className="text-sm text-ink-soft">
          Set aside — you can bring it back{" "}
          <span aria-hidden="true">·</span>{" "}
          <button
            type="button"
            onClick={bringBack}
            disabled={busy}
            className="min-h-11 font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-sm disabled:opacity-50"
          >
            Undo
          </button>
        </p>
        {error && (
          <span role="status" className="text-sm text-ink-soft">
            {error}
          </span>
        )}
      </div>
    );
  }

  if (!session) return null;

  const paused = session.status === "paused";

  return (
    <Card padding="lg" className="border-hairline bg-accent-aqua">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg text-ink">
              {paused ? "Your sort is paused" : "Active session"}
            </h2>
            <Badge variant={session.status}>{session.status}</Badge>
          </div>
          <p className="text-sm text-ink">
            {paused
              ? "Your sort is safe — pick up where you left off."
              : session.goal || "Preference discovery"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {!confirming ? (
            <div className="flex gap-2">
              {/* A paused row stays status='paused' in the DB — a bare Link would
                  land the curator mid-sort while the row says paused, desyncing
                  the in-progress predicate. ResumeControl PATCHes status:active
                  THEN navigates, so the DB and the URL agree. */}
              {paused ? (
                <ResumeControl
                  sessionId={session.id}
                  sortHref={resumeHref}
                  onBusyChange={setResumeBusy}
                  label="Resume sorting"
                />
              ) : (
                <Link href={resumeHref}>
                  <Button>Resume sorting</Button>
                </Link>
              )}
              {/* Disabled while a resume PATCH is in flight so a curator can't
                  open the set-aside confirm and DELETE mid-resume (same row). */}
              <Button
                variant="secondary"
                onClick={() => setConfirming(true)}
                disabled={resumeBusy}
              >
                Set aside
              </Button>
            </div>
          ) : (
            <div
              role="group"
              aria-label="Set this session aside"
              className="flex flex-col items-start gap-1 sm:items-end"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink">Set this session aside?</span>
                <Button
                  ref={cancelRef}
                  variant="secondary"
                  onClick={() => {
                    setConfirming(false);
                    setError("");
                  }}
                  disabled={busy}
                >
                  Never mind
                </Button>
                <Button onClick={setAside} disabled={busy}>
                  {busy ? "Setting aside…" : "Set aside"}
                </Button>
              </div>
              {error && (
                <span role="status" className="text-sm text-ink-soft">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
