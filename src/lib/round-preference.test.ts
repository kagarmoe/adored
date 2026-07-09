// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getRoundBox, setRoundBox, DEFAULT_ROUND_BOX, ROUND_BOX_OPTIONS } from "./round-preference";

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

  it("defaults to 2 minutes when nothing is stored", () => {
    expect(DEFAULT_ROUND_BOX).toBe(2);
    expect(getRoundBox()).toBe(2);
  });

  it("round-trips each valid value (incl. the 0.5 → '0.5' → 0.5 trip)", () => {
    for (const v of [0.5, 1, 2, 5, "none"] as const) {
      setRoundBox(v);
      expect(getRoundBox()).toBe(v);
    }
  });

  it("persists 0.5 as the string '0.5'", () => {
    setRoundBox(0.5);
    expect(window.localStorage.getItem("pi-round-box")).toBe("0.5");
  });

  it("persists to the pi-round-box key", () => {
    setRoundBox(5);
    expect(window.localStorage.getItem("pi-round-box")).toBe("5");
  });

  describe("clamp-on-read migration (the clamp IS the migration)", () => {
    it("keeps 'none' as 'none'", () => {
      window.localStorage.setItem("pi-round-box", "none");
      expect(getRoundBox()).toBe("none");
    });

    for (const raw of ["0.5", "1", "2", "5"] as const) {
      it(`keeps a valid stored ${raw} as itself`, () => {
        window.localStorage.setItem("pi-round-box", raw);
        expect(getRoundBox()).toBe(Number(raw));
      });
    }

    for (const stale of ["10", "20"] as const) {
      it(`clamps stale ${stale} down to 5`, () => {
        window.localStorage.setItem("pi-round-box", stale);
        expect(getRoundBox()).toBe(5);
      });
    }

    for (const garbage of ["7", "abc", ""] as const) {
      it(`falls back to the default (2) for garbage ${JSON.stringify(garbage)}`, () => {
        window.localStorage.setItem("pi-round-box", garbage);
        expect(getRoundBox()).toBe(2);
      });
    }
  });

  it("ROUND_BOX_OPTIONS is the one home for the option list (verbatim)", () => {
    expect(ROUND_BOX_OPTIONS).toEqual([
      { value: 0.5, label: "30 seconds" },
      { value: 1, label: "1 minute" },
      { value: 2, label: "2 minutes" },
      { value: 5, label: "5 minutes" },
      { value: "none", label: "No timer" },
    ]);
  });

  describe("SSR safety (no window)", () => {
    const realWindow = globalThis.window;

    afterEach(() => {
      vi.stubGlobal("window", realWindow);
    });

    it("returns the default without throwing when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(() => getRoundBox()).not.toThrow();
      expect(getRoundBox()).toBe(2);
    });

    it("is a no-op (no throw) when setting with no window", () => {
      vi.stubGlobal("window", undefined);
      expect(() => setRoundBox(5)).not.toThrow();
    });
  });
});
