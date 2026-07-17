// Pure round-timer math with an INJECTABLE bowl: the caller always passes `nowMs`,
// so these functions never read Date.now() and are deterministically testable.
//
// "No timer" is represented by boxMs === null: there is no countdown, so the round
// never expires. In that case remainingMs is null and fractionElapsed is 0.

/** Milliseconds left in the round, clamped to >= 0. null when there is no timer. */
export function remainingMs(startedAtMs: number, boxMs: number | null, nowMs: number): number | null {
  if (boxMs === null) return null;
  const left = startedAtMs + boxMs - nowMs;
  return left > 0 ? left : 0;
}

/** Whether the round's time box has elapsed. Always false when there is no timer. */
export function isExpired(startedAtMs: number, boxMs: number | null, nowMs: number): boolean {
  if (boxMs === null) return false;
  return nowMs - startedAtMs >= boxMs;
}

/** Progress from 0 (just started) to 1 (elapsed), for the bar fill. 0 when no timer. */
export function fractionElapsed(startedAtMs: number, boxMs: number | null, nowMs: number): number {
  if (boxMs === null) return 0;
  if (boxMs <= 0) return 1;
  const elapsed = (nowMs - startedAtMs) / boxMs;
  if (elapsed <= 0) return 0;
  if (elapsed >= 1) return 1;
  return elapsed;
}
