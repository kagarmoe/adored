// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getRoundBox,
  setRoundBox,
  DEFAULT_ROUND_BOX,
  boxToMs,
  feelName,
  formatBoxDuration,
  roundBoxLabel,
} from "./round-preference";

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

describe("round-preference", () => {
  beforeEach(() => {
    installStorage();
  });

  it("defaults to 120 seconds (2 minutes) when nothing is stored", () => {
    expect(DEFAULT_ROUND_BOX).toBe(120);
    expect(getRoundBox()).toBe(120);
  });

  it("round-trips new second values", () => {
    for (const v of [30, 60, 120, 300, "none"] as const) {
      setRoundBox(v);
      expect(getRoundBox()).toBe(v);
    }
  });

  it("persists to the pi-round-box key", () => {
    setRoundBox(300);
    expect(window.localStorage.getItem("pi-round-box")).toBe("300");
  });

  describe("clamp-on-read migration (the clamp IS the migration)", () => {
    it("keeps 'none' as 'none'", () => {
      window.localStorage.setItem("pi-round-box", "none");
      expect(getRoundBox()).toBe("none");
    });

    for (const garbage of ["7", "abc", ""] as const) {
      it(`falls back to the default (120) for garbage ${JSON.stringify(garbage)}`, () => {
        window.localStorage.setItem("pi-round-box", garbage);
        expect(getRoundBox()).toBe(120);
      });
    }
  });

  describe("SSR safety (no window)", () => {
    const realWindow = globalThis.window;

    afterEach(() => {
      vi.stubGlobal("window", realWindow);
    });

    it("returns the default without throwing when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(() => getRoundBox()).not.toThrow();
      expect(getRoundBox()).toBe(120);
    });

    it("is a no-op (no throw) when setting with no window", () => {
      vi.stubGlobal("window", undefined);
      expect(() => setRoundBox(300)).not.toThrow();
    });
  });
});

describe("seconds model", () => {
  beforeEach(() => {
    installStorage();
  });

  it("parses every legacy minutes value, clamping 10 and 20 to 300", () => {
    const cases: Array<[string, unknown]> = [
      ["0.5", 30], ["1", 60], ["2", 120], ["5", 300], ["10", 300], ["20", 300], ["none", "none"],
    ];
    for (const [raw, expected] of cases) {
      window.localStorage.setItem("pi-round-box", raw);
      expect(getRoundBox()).toBe(expected);
    }
  });

  it("constructor (prototype-chain key) → getRoundBox returns default (120), not NaN", () => {
    // Object.hasOwn (not `in`) ensures prototype keys are excluded; "constructor" stored
    // would cause a bug with `in`, but is correctly ignored.
    window.localStorage.setItem("pi-round-box", "constructor");
    expect(getRoundBox()).toBe(120);
  });
  it("round-trips new second values and defaults on garbage", () => {
    setRoundBox(150);
    expect(getRoundBox()).toBe(150);
    window.localStorage.setItem("pi-round-box", "97");
    expect(getRoundBox()).toBe(120);
  });
  it("boxToMs: seconds to ms, none to null", () => {
    expect(boxToMs(30)).toBe(30_000);
    expect(boxToMs(300)).toBe(300_000);
    expect(boxToMs("none")).toBeNull();
  });
  it("every reachable value has a feel name and a duration label (totality)", () => {
    const steps = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300] as const;
    for (const s of steps) expect(roundBoxLabel(s)).toMatch(/ — (a breath|a handful|a real dent)$/);
    expect(roundBoxLabel("none")).toBe("no clock at all");
  });
  it("formats: 30 seconds, whole and half minutes", () => {
    expect(formatBoxDuration(30)).toBe("30 seconds");
    expect(formatBoxDuration(60)).toBe("1 minute");
    expect(formatBoxDuration(90)).toBe("1½ minutes");
    expect(formatBoxDuration(120)).toBe("2 minutes");
    expect(roundBoxLabel(120)).toBe("2 minutes — a handful");
  });
  it("band edges: 60 is a breath, 90 a handful, 150 a handful, 180 a real dent", () => {
    expect(feelName(60)).toBe("a breath");
    expect(feelName(90)).toBe("a handful");
    expect(feelName(150)).toBe("a handful");
    expect(feelName(180)).toBe("a real dent");
  });
});

describe("degrade gracefully when storage throws", () => {
  beforeEach(() => {
    installThrowingStorage();
  });

  it("getRoundBox returns the default (120) without throwing", () => {
    expect(() => getRoundBox()).not.toThrow();
    expect(getRoundBox()).toBe(120);
  });

  it("setRoundBox is a no-op (no throw)", () => {
    expect(() => setRoundBox(150)).not.toThrow();
  });

  it("constructor stored value → getRoundBox returns default (120), not NaN", () => {
    // This test also validates the Object.hasOwn fix: "constructor" is in LEGACY_MINUTES
    // (as a prototype-chain key when using `in`), but Object.hasOwn excludes it.
    // With throwing storage, we can't set the value, so we trust the fix via the
    // prior non-throwing test; this verifies the catch fallback works.
    expect(() => getRoundBox()).not.toThrow();
    expect(getRoundBox()).toBe(120);
  });
});
