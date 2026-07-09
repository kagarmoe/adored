// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getUsagePace,
  setUsagePace,
  hasSeenQuickIntro,
  markQuickIntroSeen,
  markUsageRoundRan,
  hasUsageRoundRan,
} from "./usage-round-prefs";

// jsdom in this setup does not expose a working localStorage on file:// URLs, so
// install a minimal Map-backed Storage for the hermetic round-trip tests.
function installStorage(): Storage {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  return store;
}

// A Storage whose every access throws — models private mode / disabled storage.
function installThrowingStorage(): void {
  const thrower = () => {
    throw new Error("storage disabled");
  };
  const store: Storage = {
    get length(): number {
      throw new Error("storage disabled");
    },
    clear: thrower,
    getItem: thrower,
    setItem: thrower,
    removeItem: thrower,
    key: thrower,
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
}

describe("usage-round-prefs", () => {
  beforeEach(() => {
    installStorage();
  });

  describe("usage pace (device-global)", () => {
    it("defaults to 'relaxed' when nothing is stored (D2: Relaxed is the default)", () => {
      expect(getUsagePace()).toBe("relaxed");
    });

    it("defaults to 'relaxed' for garbage stored values", () => {
      window.localStorage.setItem("adored.usagePace.v1", "sprint");
      expect(getUsagePace()).toBe("relaxed");
    });

    it("round-trips both paces", () => {
      setUsagePace("quick");
      expect(getUsagePace()).toBe("quick");
      setUsagePace("relaxed");
      expect(getUsagePace()).toBe("relaxed");
    });

    it("persists under the adored.usagePace.v1 key", () => {
      setUsagePace("quick");
      expect(window.localStorage.getItem("adored.usagePace.v1")).toBe("quick");
    });
  });

  describe("first-Quick intro seen flag", () => {
    it("is false before it is marked", () => {
      expect(hasSeenQuickIntro()).toBe(false);
    });

    it("round-trips: true after markQuickIntroSeen()", () => {
      markQuickIntroSeen();
      expect(hasSeenQuickIntro()).toBe(true);
    });

    it("persists under the adored.usageQuickIntro.v1 key", () => {
      markQuickIntroSeen();
      expect(window.localStorage.getItem("adored.usageQuickIntro.v1")).not.toBeNull();
    });
  });

  describe("round-ran demotion memory (per curator + session)", () => {
    it("is false before the round ran", () => {
      expect(hasUsageRoundRan("cur-1", "sess-1")).toBe(false);
    });

    it("is true after markUsageRoundRan for the same (curator, session)", () => {
      markUsageRoundRan("cur-1", "sess-1");
      expect(hasUsageRoundRan("cur-1", "sess-1")).toBe(true);
    });

    it("writes an ISO timestamp under the exact composite key", () => {
      markUsageRoundRan("cur-1", "sess-1");
      const raw = window.localStorage.getItem("adored.usageRoundRan.v1.cur-1.sess-1");
      expect(raw).not.toBeNull();
      // A parseable ISO timestamp that round-trips to the same string.
      expect(new Date(raw as string).toISOString()).toBe(raw);
    });

    it("is session-scoped: a different session reads false", () => {
      markUsageRoundRan("cur-1", "sess-1");
      expect(hasUsageRoundRan("cur-1", "sess-2")).toBe(false);
    });

    it("is curator-scoped: a different curator reads false (ARCH-7 isolation)", () => {
      markUsageRoundRan("cur-1", "sess-1");
      expect(hasUsageRoundRan("cur-2", "sess-1")).toBe(false);
    });
  });

  describe("degrade gracefully when storage throws", () => {
    beforeEach(() => {
      installThrowingStorage();
    });

    it("getUsagePace returns the default without throwing", () => {
      expect(() => getUsagePace()).not.toThrow();
      expect(getUsagePace()).toBe("relaxed");
    });

    it("setUsagePace is a no-op (no throw)", () => {
      expect(() => setUsagePace("quick")).not.toThrow();
    });

    it("hasSeenQuickIntro returns false without throwing", () => {
      expect(() => hasSeenQuickIntro()).not.toThrow();
      expect(hasSeenQuickIntro()).toBe(false);
    });

    it("markQuickIntroSeen is a no-op (no throw)", () => {
      expect(() => markQuickIntroSeen()).not.toThrow();
    });

    it("hasUsageRoundRan returns false without throwing", () => {
      expect(() => hasUsageRoundRan("cur-1", "sess-1")).not.toThrow();
      expect(hasUsageRoundRan("cur-1", "sess-1")).toBe(false);
    });

    it("markUsageRoundRan is a no-op (no throw)", () => {
      expect(() => markUsageRoundRan("cur-1", "sess-1")).not.toThrow();
    });
  });

  describe("SSR safety (no window)", () => {
    const realWindow = globalThis.window;

    afterEach(() => {
      vi.stubGlobal("window", realWindow);
    });

    it("getters return defaults without throwing when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(getUsagePace()).toBe("relaxed");
      expect(hasSeenQuickIntro()).toBe(false);
      expect(hasUsageRoundRan("cur-1", "sess-1")).toBe(false);
    });

    it("setters are no-ops (no throw) when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(() => setUsagePace("quick")).not.toThrow();
      expect(() => markQuickIntroSeen()).not.toThrow();
      expect(() => markUsageRoundRan("cur-1", "sess-1")).not.toThrow();
    });
  });
});
