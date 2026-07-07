// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

// Fresh module per test: the fallback mutex chain is module-level state.
async function loadWithWebLock() {
  vi.resetModules();
  const mod = await import("./web-lock");
  return mod.withWebLock;
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "locks");
});

describe("withWebLock (in-realm fallback — jsdom has no navigator.locks)", () => {
  it("serializes callers on the same name (mutual exclusion)", async () => {
    const withWebLock = await loadWithWebLock();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = withWebLock("adored.flush.v1.a.s", async () => {
      log.push("1-in");
      await gate;
      log.push("1-out");
    });
    const p2 = withWebLock("adored.flush.v1.a.s", async () => {
      log.push("2-in");
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["1-in"]); // 2 must not enter while 1 holds the lock
    release();
    await Promise.all([p1, p2]);
    expect(log).toEqual(["1-in", "1-out", "2-in"]);
  });

  it("different names do not serialize", async () => {
    const withWebLock = await loadWithWebLock();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = withWebLock("name-a", async () => {
      log.push("a-in");
      await gate;
    });
    const p2 = withWebLock("name-b", async () => {
      log.push("b-in");
    });
    await p2;
    expect(log).toEqual(["a-in", "b-in"]); // b ran while a still held its own lock
    release();
    await p1;
  });

  it("returns the callback's value and propagates its rejection without wedging the chain", async () => {
    const withWebLock = await loadWithWebLock();
    await expect(withWebLock("name-a", async () => 42)).resolves.toBe(42);
    await expect(withWebLock("name-a", async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(withWebLock("name-a", async () => "after")).resolves.toBe("after");
  });
});

describe("withWebLock (navigator.locks available)", () => {
  it("delegates to navigator.locks.request and passes the result through", async () => {
    const request = vi.fn(
      async (_name: string, cb: (lock: { name: string }) => Promise<unknown>) => cb({ name: _name }),
    );
    Object.defineProperty(window.navigator, "locks", { value: { request }, configurable: true });
    const withWebLock = await loadWithWebLock();
    await expect(withWebLock("lock-name", async () => "via-locks")).resolves.toBe("via-locks");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("lock-name");
  });
});
