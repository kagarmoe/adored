// Pure dial math for the touch-set round-length dial. 12 o'clock = 0°,
// clockwise; a full circle = 300s (36°/step). The first step-width below 30s
// (0°–17°) is the "no clock" zone — a finger landing just shy of 12 lands on
// "none", never a stray 30s.
import { BOX_STEP_SECONDS, MAX_BOX_SECONDS, MIN_BOX_SECONDS, type RoundBoxSeconds } from "@/lib/round-preference";

const DEG_PER_STEP = 360 / (MAX_BOX_SECONDS / BOX_STEP_SECONDS); // 36

export function angleToBox(angleDeg: number): RoundBoxSeconds {
  const a = ((angleDeg % 360) + 360) % 360;
  const step = Math.round(a / DEG_PER_STEP);
  const seconds = step * BOX_STEP_SECONDS;
  if (seconds < MIN_BOX_SECONDS) return "none";
  return Math.min(seconds, MAX_BOX_SECONDS) as RoundBoxSeconds;
}

export function boxToAngle(box: RoundBoxSeconds): number {
  return box === "none" ? 0 : (box / BOX_STEP_SECONDS) * DEG_PER_STEP;
}

export function pointToAngle(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(x - cx, cy - y) * (180 / Math.PI) + 360) % 360;
}

export function stepBox(box: RoundBoxSeconds, delta: 1 | -1): RoundBoxSeconds {
  if (box === "none") return delta === 1 ? MIN_BOX_SECONDS : "none";
  const next = box + delta * BOX_STEP_SECONDS;
  if (next < MIN_BOX_SECONDS) return "none";
  return Math.min(next, MAX_BOX_SECONDS) as RoundBoxSeconds;
}
