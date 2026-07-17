"use client";

import { useEffect, useRef, useState } from "react";
import { fractionElapsed, isExpired, remainingMs } from "@/lib/round-timer";
import { TimerRing } from "./TimerRing";

interface RoundTimerProps {
  startedAtMs: number;
  /** Milliseconds in the round's time box. null = no timer: no countdown, never expires. */
  boxMs: number | null;
  /** Fires exactly once when the round crosses expiry. Never fires when boxMs is null. */
  onExpire: () => void;
  roundLabel: string;
  /** When given, the ring becomes a ≥44px tap target that opens the round-length control. */
  onAdjust?: () => void;
}

const TICK_MS = 1_000;

/** Under a minute left, honest for sub-minute boxes that must never claim a whole minute (TONE). */
export const SUB_MINUTE_LABEL = "Less than a minute left in this round";

/** Whole minutes left, rounded up so a still-running round never reads "0 minutes left". */
function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * A per-round soft countdown: a quiet violet ring (wireframes: "no digits") with the
 * remaining time announced for screen-reader users only — the visible surface never
 * claims a precise number. At expiry the ring settles to gold WITH a non-colour cue
 * (glyph + visible "Round complete"), because colour is never the sole signal. The
 * coarse tick — and therefore the expiry callback — always runs regardless of what's
 * rendered.
 */
export function RoundTimer({ startedAtMs, boxMs, onExpire, roundLabel, onAdjust }: RoundTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  // Keep the latest onExpire without re-arming the interval each render. Written after
  // commit (never during render), and declared before the tick effect so the interval
  // is always armed against the freshest callback.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    // No timer: no clock, no countdown, no expiry.
    if (boxMs === null) return;

    // The one place Date.now() is owned: the component's clock, read at each tick.
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!firedRef.current && isExpired(startedAtMs, boxMs, t)) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [startedAtMs, boxMs]);

  const expired = boxMs !== null && isExpired(startedAtMs, boxMs, now);
  const remaining = remainingMs(startedAtMs, boxMs, now) ?? 0;
  const mins = minutesLeft(remaining);

  const ring = (
    <TimerRing
      fraction={boxMs === null ? 0 : 1 - fractionElapsed(startedAtMs, boxMs, now)}
      size={40}
      expired={expired}
      discClassName="bg-ground"
    />
  );
  const adjustButton = onAdjust ? (
    <button
      type="button"
      onClick={onAdjust}
      aria-label="Change round length"
      className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
    >
      {ring}
    </button>
  ) : (
    ring
  );

  if (boxMs === null) {
    // No countdown, no live region — but the adjust affordance must survive
    // ("'No timer' is a first-class peer, never a hidden mode").
    return onAdjust ? (
      <div className="flex items-center gap-2">
        {adjustButton}
        <span className="text-sm text-ink-soft">No clock</span>
      </div>
    ) : (
      <p className="text-sm text-ink-soft">{roundLabel}</p>
    );
  }

  return (
    <div aria-live="polite" role="timer" className="flex items-center gap-2">
      {adjustButton}
      {expired ? (
        <p className="flex items-center gap-1 text-sm text-ink-soft">
          <span aria-hidden>✓</span>
          <span>Round complete</span>
        </p>
      ) : (
        <p className="sr-only">
          {remaining < 60_000
            ? SUB_MINUTE_LABEL
            : `About ${mins} ${mins === 1 ? "minute" : "minutes"} left in this round`}
        </p>
      )}
    </div>
  );
}
