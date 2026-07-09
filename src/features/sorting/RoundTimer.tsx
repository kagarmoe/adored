"use client";

import { useEffect, useRef, useState } from "react";
import { fractionElapsed, isExpired, remainingMs } from "@/lib/round-timer";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface RoundTimerProps {
  startedAtMs: number;
  /** Milliseconds in the round's time box. null = no timer: no countdown, never expires. */
  boxMs: number | null;
  /** Fires exactly once when the round crosses expiry. Never fires when boxMs is null. */
  onExpire: () => void;
  roundLabel: string;
}

const TICK_MS = 1_000;

/** Under a minute left, honest for sub-minute boxes that must never claim a whole minute (TONE). */
export const SUB_MINUTE_LABEL = "Less than a minute left in this round";

/** Whole minutes left, rounded up so a still-running round never reads "0 minutes left". */
function minutesLeft(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * A per-round soft countdown: a depleting violet bar plus a quiet "About N min left"
 * label. At expiry it settles to gold WITH a non-colour cue (glyph + "Round complete"),
 * because colour is never the sole signal. Under reduced motion the bar does not animate,
 * but the coarse tick — and therefore the expiry callback — still runs: suppressing the
 * animation must never suppress the round ending.
 */
export function RoundTimer({ startedAtMs, boxMs, onExpire, roundLabel }: RoundTimerProps) {
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  // Keep the latest onExpire without re-arming the interval each render.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

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

  // No timer: just the round label, no bar, no live region.
  if (boxMs === null) {
    return <p className="text-sm text-ink-soft">{roundLabel}</p>;
  }

  const expired = isExpired(startedAtMs, boxMs, now);
  const remaining = remainingMs(startedAtMs, boxMs, now) ?? 0;
  const elapsed = fractionElapsed(startedAtMs, boxMs, now);
  const remainingPct = Math.round((1 - elapsed) * 100);
  const mins = minutesLeft(remaining);

  return (
    <div aria-live="polite" role="timer" className="space-y-1">
      {/* Bar track (soft) with the depleting violet fill; gold at rest on expiry. */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-content-soft" aria-hidden>
        <div
          className={`h-full rounded-full ${expired ? "bg-spark" : "bg-decor"} ${
            reducedMotion ? "" : "transition-[width] duration-1000 ease-linear"
          }`}
          style={{ width: expired ? "100%" : `${remainingPct}%` }}
        />
      </div>

      {expired ? (
        <p className="flex items-center gap-1 text-sm text-ink-soft">
          <span aria-hidden>✓</span>
          <span>Round complete</span>
        </p>
      ) : remaining < 60_000 ? (
        <p className="text-sm text-ink-soft">{SUB_MINUTE_LABEL}</p>
      ) : (
        <p className="text-sm text-ink-soft">
          About {mins} {mins === 1 ? "minute" : "minutes"} left in this round
        </p>
      )}
    </div>
  );
}
