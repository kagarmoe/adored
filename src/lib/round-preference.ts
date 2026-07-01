// Device-local round-length preference, stored in localStorage under `pi-round-box`.
// Mirrors the pi-theme read/write pattern (guard typeof window, wrap in try/catch so
// private mode / disabled storage degrades gracefully instead of throwing).
//
// Default is "none": a calm, no-pressure default — the app imposes no countdown
// unless the user opts into one.

export type RoundBox = 5 | 10 | 20 | "none";

export const DEFAULT_ROUND_BOX: RoundBox = "none";

const KEY = "pi-round-box";
const VALID: readonly RoundBox[] = [5, 10, 20, "none"];

export function getRoundBox(): RoundBox {
  if (typeof window === "undefined") return DEFAULT_ROUND_BOX;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "none") return "none";
    const n = Number(raw);
    return (VALID as readonly (RoundBox | number)[]).includes(n) ? (n as RoundBox) : DEFAULT_ROUND_BOX;
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
