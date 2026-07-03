import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPostHogClient is the server-side PostHog accessor. Two invariants:
//  (1) When a token IS set, it returns a MODULE SINGLETON — the same client
//      instance across calls — so a warm serverless instance isn't leaking a
//      fresh client (and a background flush) per emit.
//  (2) When NO token is set, it returns a shared no-op stub and NEVER constructs
//      a real PostHog client (no network I/O, no throw).

const { mockPostHogCtor } = vi.hoisted(() => ({
  mockPostHogCtor: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  // Each `new PostHog(...)` records a call and yields a distinct object so the
  // test can prove the singleton reuses ONE construction (ctor called once).
  PostHog: class {
    capture = vi.fn();
    flush = vi.fn().mockResolvedValue(undefined);
    shutdown = vi.fn().mockResolvedValue(undefined);
    constructor(token: string, opts: unknown) {
      mockPostHogCtor(token, opts);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // A module-level singleton persists across calls WITHIN a module instance, so
  // reset the module registry between tests to get a clean singleton each time.
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getPostHogClient — token set → memoized singleton", () => {
  it("returns the SAME instance across calls and constructs the client only once", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
    const { getPostHogClient } = await import("./posthog-server");

    const a = getPostHogClient();
    const b = getPostHogClient();
    const c = getPostHogClient();

    expect(a).toBe(b);
    expect(b).toBe(c);
    // Lazily constructed exactly once, then reused.
    expect(mockPostHogCtor).toHaveBeenCalledTimes(1);
    // flushAt:1 keeps per-event delivery immediate even as a shared client.
    const opts = mockPostHogCtor.mock.calls[0][1] as { flushAt?: number };
    expect(opts.flushAt).toBe(1);
  });

  it("exposes flush (used for serverless delivery) — the client is real", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
    const { getPostHogClient } = await import("./posthog-server");
    const client = getPostHogClient();
    expect(typeof client.flush).toBe("function");
  });
});

describe("getPostHogClient — no token → shared no-op stub", () => {
  it("never constructs a real client and returns the same stub each call", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const { getPostHogClient } = await import("./posthog-server");

    const a = getPostHogClient();
    const b = getPostHogClient();

    expect(mockPostHogCtor).not.toHaveBeenCalled();
    expect(a).toBe(b);
    // The stub's capture/flush are safe no-ops.
    expect(() => a.capture({ distinctId: "x", event: "e" })).not.toThrow();
    await expect(a.flush()).resolves.toBeUndefined();
  });
});
