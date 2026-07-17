// Device-local round-length preference (RoundBoxSeconds), stored in localStorage under `pi-round-box`.
// Model: 30s steps from 30–300 seconds, plus "none" as a first-class peer (no timer).
// 2-minute default (120s). Legacy devices stored minutes (0.5, 1, 2, 5, 10, 20); LEGACY_MINUTES
// read-once map parses these: 0.5→30, 1→60, 2→120, 5→300, 10→300 (clamped), 20→300 (clamped).
// Guards typeof window, wraps all access in try/catch for graceful degradation in
// private mode or when storage is disabled — no throw, just return default or no-op.

export type RoundBoxSeconds = 30 | 60 | 90 | 120 | 150 | 180 | 210 | 240 | 270 | 300 | "none";

export const DEFAULT_ROUND_BOX: RoundBoxSeconds = 120;
export const MIN_BOX_SECONDS = 30;
export const MAX_BOX_SECONDS = 300;
export const BOX_STEP_SECONDS = 30;

const KEY = "pi-round-box";

// Pre-seconds devices stored MINUTES ("0.5".."20"); disjoint from second values
// (all ≥30), so this read-once map is unambiguous. 10/20 keep their old clamp.
const LEGACY_MINUTES: Record<string, RoundBoxSeconds> = {
  "0.5": 30, "1": 60, "2": 120, "5": 300, "10": 300, "20": 300,
};

function isStep(n: number): n is Exclude<RoundBoxSeconds, "none"> {
  return Number.isInteger(n) && n >= MIN_BOX_SECONDS && n <= MAX_BOX_SECONDS && n % BOX_STEP_SECONDS === 0;
}

export function getRoundBox(): RoundBoxSeconds {
  if (typeof window === "undefined") return DEFAULT_ROUND_BOX;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_ROUND_BOX;
    if (raw === "none") return "none";
    if (Object.hasOwn(LEGACY_MINUTES, raw)) return LEGACY_MINUTES[raw];
    const n = Number(raw);
    return isStep(n) ? n : DEFAULT_ROUND_BOX;
  } catch {
    return DEFAULT_ROUND_BOX;
  }
}

export function setRoundBox(value: RoundBoxSeconds): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    // private mode / storage disabled — the in-memory choice still applies
  }
}

// The ONE seconds→ms converter (replaces the duplicated box·MINUTE_MS pair —
// a missed call site is now a type error, not a silent 60× timing bug).
export function boxToMs(box: RoundBoxSeconds): number | null {
  return box === "none" ? null : box * 1_000;
}

export function feelName(box: RoundBoxSeconds): string {
  if (box === "none") return "no clock at all";
  if (box <= 60) return "a breath";
  if (box <= 150) return "a handful";
  return "a real dent";
}

export function formatBoxDuration(seconds: Exclude<RoundBoxSeconds, "none">): string {
  if (seconds === 30) return "30 seconds";
  const m = Math.floor(seconds / 60);
  const half = seconds % 60 === 30;
  return `${m}${half ? "½" : ""} minute${m === 1 && !half ? "" : "s"}`;
}

export function roundBoxLabel(box: RoundBoxSeconds): string {
  return box === "none" ? "no clock at all" : `${formatBoxDuration(box)} — ${feelName(box)}`;
}
