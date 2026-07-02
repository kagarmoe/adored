// The walkthrough's "seen it" flag lives in a cookie (no DB, no server state).
// A cookie (not localStorage) so the collections *server component* can read it
// and redirect to /welcome BEFORE rendering — no SSR-paint flash. Centralized
// here so nothing else touches raw document.cookie; reads are SSR-safe (no
// document on the server) and tolerate cookie access throwing.
export const DISMISS_KEY = "adored-welcome-dismissed";

// One year — the "you've seen the intro" signal should outlast a browser session.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// Pure predicate over a raw Cookie header / document.cookie string, so both the
// client (document.cookie) and the server (next/headers) paths share one parse.
export function isDismissedInCookieString(cookieString: string): boolean {
  return cookieString
    .split(";")
    .some((pair) => pair.trim().startsWith(`${DISMISS_KEY}=1`));
}

// Client read. SSR-safe: no document on the server -> not dismissed.
export function isWelcomeDismissed(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return isDismissedInCookieString(document.cookie);
  } catch {
    return false;
  }
}

// Client write. SSR-safe and non-fatal if cookies are unavailable.
export function dismissWelcome(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${DISMISS_KEY}=1; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Cookies unavailable — the auto-trigger simply stays armed. Non-fatal;
    // re-open and manual visits still work.
  }
}
