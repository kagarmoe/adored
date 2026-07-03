import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// scheduleWaitUntil wraps Vercel's waitUntil (from @vercel/functions), the
// documented Fluid-Compute primitive for running async work AFTER the response
// is sent. It must be a best-effort no-op when unavailable (local/dev/test, or
// any non-Vercel runtime, or when called outside a request context) and it must
// NEVER throw — a telemetry helper can't be allowed to break the caller.

const { mockWaitUntil } = vi.hoisted(() => ({
  mockWaitUntil: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.doUnmock("@vercel/functions");
});

afterEach(() => {
  vi.doUnmock("@vercel/functions");
});

describe("scheduleWaitUntil — delegates to @vercel/functions waitUntil", () => {
  it("passes the promise to waitUntil when it is available", async () => {
    vi.doMock("@vercel/functions", () => ({ waitUntil: mockWaitUntil }));
    const { scheduleWaitUntil } = await import("./wait-until");

    const p = Promise.resolve();
    scheduleWaitUntil(p);

    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    expect(mockWaitUntil).toHaveBeenCalledWith(p);
    await p;
  });
});

describe("scheduleWaitUntil — best-effort no-op / never throws", () => {
  it("does not throw when waitUntil itself throws (outside a request context)", async () => {
    vi.doMock("@vercel/functions", () => ({
      waitUntil: () => {
        throw new Error("no request context");
      },
    }));
    const { scheduleWaitUntil } = await import("./wait-until");

    const p = Promise.resolve();
    expect(() => scheduleWaitUntil(p)).not.toThrow();
    await p;
  });

  it("swallows a rejection so an un-awaited flush() can't crash the process", async () => {
    // When waitUntil throws or no-ops, the wrapper must still attach a rejection
    // handler so a flush() rejection can't become an unhandled rejection.
    vi.doMock("@vercel/functions", () => ({
      waitUntil: () => {
        throw new Error("no request context");
      },
    }));
    const { scheduleWaitUntil } = await import("./wait-until");

    const rejected = Promise.reject(new Error("flush failed"));
    expect(() => scheduleWaitUntil(rejected)).not.toThrow();
    // Give microtasks a chance to run; no unhandled rejection should surface.
    await new Promise((r) => setTimeout(r, 0));
  });
});
