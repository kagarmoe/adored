// Device-local round-length preference, stored in localStorage under `pi-round-box`.
// Mirrors the pi-theme read/write pattern (guard typeof window, wrap in try/catch so
// private mode / disabled storage degrades gracefully instead of throwing).
//
// Range is 30 s–5 m with a 2-minute default and "No timer" as a first-class peer
// (parent §1.12): the earlier "none, calm no-pressure" default was deliberately
// superseded — the review's regression warning was answered by keeping "No timer" a
// peer option, not the default. getRoundBox() clamps on read, so a device that stored
// the shipped 10/20 choices migrates silently (the clamp IS the migration).

export type RoundBox = 0.5 | 1 | 2 | 5 | "none";

export const DEFAULT_ROUND_BOX: RoundBox = 2; // named const, tunable (parent §1.12)

export const ROUND_BOX_OPTIONS: ReadonlyArray<{ value: RoundBox; label: string }> = [
  { value: 0.5, label: "30 seconds" },
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 5, label: "5 minutes" },
  { value: "none", label: "No timer" },
];

const KEY = "pi-round-box";
const VALID: readonly number[] = [0.5, 1, 2, 5];

export function getRoundBox(): RoundBox {
  if (typeof window === "undefined") return DEFAULT_ROUND_BOX;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "none") return "none";
    const n = Number(raw);
    if (VALID.includes(n)) return n as RoundBox;
    // Stale shipped choices (10/20 minutes) clamp down to the new 5-minute ceiling.
    if (n === 10 || n === 20) return 5;
    return DEFAULT_ROUND_BOX;
  } catch {
    return DEFAULT_ROUND_BOX;
  }
}

export function setRoundBox(value: RoundBox): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    // private mode / storage disabled — the in-memory choice still applies
  }
}
