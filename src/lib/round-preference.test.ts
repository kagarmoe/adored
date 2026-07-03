// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getRoundBox, setRoundBox, DEFAULT_ROUND_BOX } from "./round-preference";

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

describe("round-preference", () => {
  beforeEach(() => {
    installStorage();
  });

  it("defaults to 'none' when nothing is stored", () => {
    expect(DEFAULT_ROUND_BOX).toBe("none");
    expect(getRoundBox()).toBe("none");
  });

  it("round-trips each valid value", () => {
    for (const v of [5, 10, 20, "none"] as const) {
      setRoundBox(v);
      expect(getRoundBox()).toBe(v);
    }
  });

  it("persists to the pi-round-box key", () => {
    setRoundBox(10);
    expect(window.localStorage.getItem("pi-round-box")).toBe("10");
  });

  it("falls back to the default for an invalid stored value", () => {
    window.localStorage.setItem("pi-round-box", "banana");
    expect(getRoundBox()).toBe("none");
  });

  it("falls back to the default for a non-allowed number", () => {
    window.localStorage.setItem("pi-round-box", "7");
    expect(getRoundBox()).toBe("none");
  });

  describe("SSR safety (no window)", () => {
    const realWindow = globalThis.window;

    afterEach(() => {
      vi.stubGlobal("window", realWindow);
    });

    it("returns the default without throwing when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(() => getRoundBox()).not.toThrow();
      expect(getRoundBox()).toBe("none");
    });

    it("is a no-op (no throw) when setting with no window", () => {
      vi.stubGlobal("window", undefined);
      expect(() => setRoundBox(20)).not.toThrow();
    });
  });
});
