// The walkthrough's "seen it" flag lives device-local (no DB, no server state).
// Centralized here so nothing else touches raw localStorage — reads are guarded
// for SSR (no window on the server) and for private-mode localStorage throws.
export const DISMISS_KEY = "adored-welcome-dismissed";

export function isWelcomeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissWelcome(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage unavailable (private mode / quota) — the auto-trigger simply
    // stays armed. Non-fatal; re-open and manual visits still work.
  }
}
