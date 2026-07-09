// Three device-local facts for the usage round, stored in localStorage (spec §3.5).
// Mirrors round-preference.ts: guard `typeof window`, wrap in try/catch so private
// mode / disabled storage degrades gracefully instead of throwing. Getters never throw.
//
//   1. pace           — Relaxed vs Quick, device-global (D2: Relaxed is the only default).
//   2. quick-intro     — whether the first-Quick intro was already shown.
//   3. round-ran       — per (curator, session), for anti-nagging demotion memory.
//
// The round-ran keys accumulate one tiny string per (curator, session): accepted, named
// residue — deliberately NOT under the pending/quarantine GC prefixes.

export type UsagePace = "relaxed" | "quick";

const PACE_KEY = "adored.usagePace.v1";
const QUICK_INTRO_KEY = "adored.usageQuickIntro.v1";
const ROUND_RAN_PREFIX = "adored.usageRoundRan.v1";

export function getUsagePace(): UsagePace {
  if (typeof window === "undefined") return "relaxed";
  try {
    return window.localStorage.getItem(PACE_KEY) === "quick" ? "quick" : "relaxed";
  } catch {
    return "relaxed";
  }
}

export function setUsagePace(p: UsagePace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PACE_KEY, p);
  } catch {
    // private mode / storage disabled — the in-memory choice still applies
  }
}

export function hasSeenQuickIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(QUICK_INTRO_KEY) !== null;
  } catch {
    return false;
  }
}

export function markQuickIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUICK_INTRO_KEY, new Date().toISOString());
  } catch {
    // private mode / storage disabled — no-op
  }
}

function roundRanKey(curatorId: string, sessionId: string): string {
  return `${ROUND_RAN_PREFIX}.${curatorId}.${sessionId}`;
}

export function markUsageRoundRan(curatorId: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(roundRanKey(curatorId, sessionId), new Date().toISOString());
  } catch {
    // private mode / storage disabled — no-op
  }
}

export function hasUsageRoundRan(curatorId: string, sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(roundRanKey(curatorId, sessionId)) !== null;
  } catch {
    return false;
  }
}
