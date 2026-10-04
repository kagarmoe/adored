"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listPendingKeysForCurator, sweepExpired, type QueueKey } from "./decisionQueue";
import { drain, subscribeNotices } from "./decisionFlusher";
import { PendingNotices } from "./pendingNotices";

// Reveal is time-bounded (spec §3.4/F8): after one backoff step, availability
// beats the ordering guarantee; the post-ack refresh restores it.
export const GATE_REVEAL_BOUND_MS = 5_000;

// Person-side copy — exported constants so tests assert the exact strings;
// TONE.md register, never "error"/"failed" (final wording is a TONE-review item).
export const GATE_WAITING_LINE = "Gathering up the answers you already gave — just a moment";
export const GATE_CATCHUP_LINE =
  "A few of your answers are still on their way — everything here catches up in a moment";

/**
 * Crash/pause/completion recovery (spec §3.4): before any sort surface renders
 * from stale server-selected data, drain this curator's pending queues through
 * the SAME module engine (a drain already started by a trigger hook is awaited,
 * never raced — F12), refresh, and only then mount the children — a conditional
 * mount, never CSS-hide, so a round component can never copy a stale queue into
 * client state. The children are the already-fetched server subtree; this gate
 * defers mounting, it fetches nothing.
 */
export function PendingDecisionsGate({
  curatorId,
  children,
}: {
  curatorId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Read once at first client render. On the server (and any storage-less
  // environment) this is [] — the normal, zero-cost path renders children
  // immediately.
  const [pendingKeys] = useState<QueueKey[]>(() => listPendingKeysForCurator(curatorId));
  const recovering = pendingKeys.length > 0;
  const [drained, setDrained] = useState(!recovering);
  const [boundedReveal, setBoundedReveal] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const authRequiredRef = useRef(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!recovering) {
      sweepExpired(Date.now()); // GC even on the happy path (F18)
      return;
    }
    const bound = setTimeout(() => setBoundedReveal(true), GATE_REVEAL_BOUND_MS);
    // Only THIS drain's notices decide the reveal. The engine replays its sticky
    // notices synchronously on subscribe; a sign-in line left over from an
    // earlier drain must not skip the refresh after a recovery that lands.
    let live = false;
    const unsubscribe = subscribeNotices((notice) => {
      if (live && notice.kind === "auth_required") {
        // Reveal immediately with the re-auth affordance; the queue is
        // preserved across re-login (spec §3.2) — no refresh, nothing changed.
        authRequiredRef.current = true;
        setAuthRequired(true);
      }
    });
    live = true;
    void drain(pendingKeys, { recovery: true }).finally(() => {
      clearTimeout(bound);
      unsubscribe();
      sweepExpired(Date.now());
      if (authRequiredRef.current) {
        setDrained(true);
        return;
      }
      // Mark drained INSIDE the transition so children mount only when the
      // refresh transition settles — they render from the post-flush payload.
      startTransition(() => {
        router.refresh();
        setDrained(true);
      });
    });
  }, [recovering, pendingKeys, router]);

  const revealed = !recovering || authRequired || boundedReveal || (drained && !isPending);

  // One fixed tree shape. The notice slot exists only when a recovery actually
  // happened, so ordinary mounts add nothing.
  return (
    <>
      {recovering && (
        <div className="mx-auto max-w-xl space-y-2 empty:hidden">
          {/* Before reveal the gate is the only voice; after it, the surface's own single
              PendingNotices speaks (it reads the engine's sticky notices on mount), so the
              line can never be doubled. */}
          {!revealed && <PendingNotices />}
          {revealed && !drained && (
            <p role="status" className="rounded-control bg-content-soft px-4 py-3 text-sm text-ink-soft">
              {GATE_CATCHUP_LINE}
            </p>
          )}
        </div>
      )}
      {revealed ? children : (
        <p role="status" className="mx-auto max-w-xl text-sm text-ink-soft">
          {GATE_WAITING_LINE}
        </p>
      )}
    </>
  );
}
