import { PostHog } from 'posthog-node';

// The subset of the posthog-node client that server routes actually use.
// Callers do `getPostHogClient().capture(...)` then `await ...shutdown()`.
type ServerPostHog = Pick<PostHog, 'capture' | 'shutdown'>;

// No-op stub used when no project token is configured (tests, local dev, any
// env without NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN). Capture is skipped silently —
// no network I/O, no throw — so analytics never breaks the request path.
const noopClient: ServerPostHog = {
  capture: () => {},
  shutdown: async () => {},
};

export function getPostHogClient(): ServerPostHog {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return noopClient;

  return new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}
