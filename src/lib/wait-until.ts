import { waitUntil } from "@vercel/functions";

// Vercel Fluid-Compute primitive: keep the function alive to finish `promise`
// AFTER the response is sent, so a freeze-on-return can't drop queued work and
// the request path pays no latency for it. Used to flush best-effort telemetry
// (PostHog db_action_failed / db_action_slow) post-response.
//
// Best-effort + NEVER throws: `waitUntil` is a no-op (and logs a warning) when
// called outside a Vercel request context — local/dev/test or any non-Vercel
// runtime. We still attach a rejection handler so a rejected flush() can't leak
// as an unhandled rejection when waitUntil no-ops or throws, and we swallow any
// throw from waitUntil itself. The caller is never affected.
export function scheduleWaitUntil(promise: Promise<unknown>): void {
  // Ensure the promise's rejection is always observed, independent of whether
  // waitUntil takes ownership of it.
  promise.catch(() => {});
  try {
    waitUntil(promise);
  } catch {
    // Outside a request context (or any waitUntil failure) — the flush still
    // races the freeze on its own; nothing here may throw.
  }
}
