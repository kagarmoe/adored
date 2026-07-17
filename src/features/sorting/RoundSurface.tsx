"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { boxToMs, getRoundBox, setRoundBox, type RoundBoxSeconds } from "@/lib/round-preference";
import { useDeviceValue } from "@/lib/useDeviceValue";
import type { MovedDecision } from "@/lib/what-moved";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { RoundLengthDialog } from "./RoundLengthDialog";
import { WhatMoved } from "./WhatMoved";

interface RoundSurfaceProps {
  /** 1-based step in the 4-step round arc (triage = 1, usage = 2, compare = 3, decide = 4). */
  step: 1 | 2 | 3 | 4;
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

const storedBoxMs = (): number | null => boxToMs(getRoundBox());

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
  // The round's clock is client-owned and fixed at mount (a lazy initializer — Date.now()
  // is impure, so it must not be called on every render).
  const [startedAtMs] = useState(() => Date.now());
  // The stored box is device-local: no timer through SSR/hydration, then the real box
  // right after mount (useDeviceValue). A mid-round switch overrides it.
  const stored = useDeviceValue<number | null>(storedBoxMs, null);
  const [chosenBoxMs, setChosenBoxMs] = useState<{ ms: number | null } | null>(null);
  const boxMs = chosenBoxMs === null ? stored : chosenBoxMs.ms;
  const [expired, setExpired] = useState(false);
  const [lengthDialogOpen, setLengthDialogOpen] = useState(false);
  // Handed to RoundTimer (renders the adjust button) AND RoundLengthDialog
  // (refocuses it on close) — the dialog is a portal, so it can't reach the
  // trigger on its own.
  const adjustButtonRef = useRef<HTMLButtonElement>(null);

  // Mid-round length switch (parent D2): re-arm boxMs against the UNCHANGED start —
  // "none" drops the countdown, a shorter box expires at the next tick.
  const onBoxChange = (box: RoundBoxSeconds) => setChosenBoxMs({ ms: boxToMs(box) });

  // The round ends on the timer expiring OR the server handing us an empty queue —
  // either way the recap replaces the content and both paths terminate the round.
  const ended = expired || queueEmpty;
  const currentBox: RoundBoxSeconds = boxMs === null ? "none" : ((boxMs / 1000) as RoundBoxSeconds);

  const timer = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <RoundTimer
          startedAtMs={startedAtMs}
          boxMs={boxMs}
          onExpire={() => setExpired(true)}
          roundLabel={roundLabel}
          onAdjust={!ended ? () => setLengthDialogOpen(true) : undefined}
          adjustButtonRef={adjustButtonRef}
        />
      </div>
    </div>
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
        <WhatMoved decisions={decisions} windowStartMs={startedAtMs} hubHref={hubHref} hadTimer={boxMs !== null} />
      ) : (
        children
      )}
      <RoundLengthDialog
        open={lengthDialogOpen}
        initial={currentBox}
        onCommit={(box) => {
          setRoundBox(box); // persist for the next round…
          onBoxChange(box); // …and re-arm THIS round against its unchanged start
        }}
        onClose={() => setLengthDialogOpen(false)}
        returnFocusRef={adjustButtonRef}
      />
    </RoundShell>
  );
}
