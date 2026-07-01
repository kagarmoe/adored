"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getRoundBox } from "@/lib/round-preference";
import type { MovedDecision } from "@/lib/what-moved";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { WhatMoved } from "./WhatMoved";

interface RoundSurfaceProps {
  /** 1-based step in the 3-step round arc (triage = 1, compare = 2). */
  step: 1 | 2 | 3;
  totalSteps: number;
  roundLabel: string;
  /** The server-fetched round content (DecisionControls / CompareChoice etc.). */
  children: ReactNode;
  /** Session decisions, for the end-of-round "what moved" recap. */
  decisions: MovedDecision[];
  /** The session hub, where Pause and "Back to your sort" return to. */
  hubHref: string;
  /**
   * True when the server rendered an empty queue (no item / no pair). The round is
   * over: show the recap instead of the (empty) content. Expiry does the same.
   */
  queueEmpty?: boolean;
}

const MINUTE_MS = 60_000;

/**
 * A thin client wrapper that gives a server-rendered triage/compare screen its round
 * chrome: the step indicator + soft timer (RoundShell + RoundTimer) around the
 * server content, and the "what moved" recap when the round ends. The round STARTS
 * ON MOUNT — startedAtMs is recorded client-side — reading its box length from the
 * device-local preference (`getRoundBox`, "none" → no timer). It NEVER creates a
 * session: the round is purely ephemeral client state layered over the durable one.
 */
export function RoundSurface({
  step,
  totalSteps,
  roundLabel,
  children,
  decisions,
  hubHref,
  queueEmpty = false,
}: RoundSurfaceProps) {
  const router = useRouter();
  // The round's clock is client-owned and fixed at mount; reading getRoundBox() here
  // (not at module load) keeps it after hydration where localStorage is available.
  const startedAtRef = useRef<number>(Date.now());
  const [boxMs, setBoxMs] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const box = getRoundBox();
    setBoxMs(box === "none" ? null : box * MINUTE_MS);
  }, []);

  // The round ends on the timer expiring OR the server handing us an empty queue —
  // either way the recap replaces the content and both paths terminate the round.
  const ended = expired || queueEmpty;

  const timer = (
    <RoundTimer
      startedAtMs={startedAtRef.current}
      boxMs={boxMs}
      onExpire={() => setExpired(true)}
      roundLabel={roundLabel}
    />
  );

  return (
    <RoundShell
      step={step}
      totalSteps={totalSteps}
      roundLabel={roundLabel}
      timer={timer}
      onPause={() => router.push(hubHref)}
    >
      {ended ? (
        <WhatMoved decisions={decisions} windowStartMs={startedAtRef.current} hubHref={hubHref} />
      ) : (
        children
      )}
    </RoundShell>
  );
}
