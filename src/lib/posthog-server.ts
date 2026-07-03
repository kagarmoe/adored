import { PostHog } from 'posthog-node';

// The subset of the posthog-node client that server routes actually use.
// Callers do `getPostHogClient().capture(...)` then `await ...flush()` — flush
// delivers the queued event WITHOUT closing the client, so the shared singleton
// stays usable for later captures in the same warm serverless instance.
type ServerPostHog = Pick<PostHog, 'capture' | 'flush'>;

// No-op stub used when no project token is configured (tests, local dev, any
// env without NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN). Capture is skipped silently —
// no network I/O, no throw — so analytics never breaks the request path. Shared
// (module-level) so the no-token path also returns the same instance each call.
const noopClient: ServerPostHog = {
  capture: () => {},
  flush: async () => {},
};

// Module-level singleton. posthog-node buffers events and (with flushInterval:0
// + flushAt:1) flushes each captured event immediately, so ONE long-lived client
// per warm instance is correct — a fresh `new PostHog(...)` per emit leaked a
// client and a background flush timer every time. Constructed lazily on first
// real use so importing this module has no side effects.
let client: ServerPostHog | undefined;

export function getPostHogClient(): ServerPostHog {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return noopClient;

  if (!client) {
    client = new PostHog(token, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}
