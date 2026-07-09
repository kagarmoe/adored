// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RoundSurface } from "./RoundSurface";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// jsdom in this setup does not expose a working localStorage on file:// URLs —
// install the house Map-backed Storage (mirrors TriageRound.test.tsx).
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

let store: Storage;

beforeEach(() => {
  vi.clearAllMocks();
  store = installStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSurface(over: Partial<Parameters<typeof RoundSurface>[0]> = {}) {
  return render(
    <RoundSurface step={3} totalSteps={4} roundLabel="Comparing" decisions={[]} hubHref="/hub" {...over}>
      <img src="/pair.jpg" alt="Pair" />
    </RoundSurface>,
  );
}

describe("RoundSurface round-length chooser (compare, spec §3.1)", () => {
  it("mid-round switch to 'No timer' removes the countdown and the round never expires", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "1"); // start with a 1-minute box
    renderSurface();

    // The countdown is live.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("timer")).toBeInTheDocument();

    // Switch to No timer mid-round: countdown gone, and advancing well past the
    // old box never ends the round.
    fireEvent.change(screen.getByRole("combobox", { name: "Round length" }), {
      target: { value: "none" },
    });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(screen.getByAltText("Pair")).toBeInTheDocument();
  });

  it("switching to a box shorter than the elapsed time ends the round into the recap", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "5"); // start with a 5-minute box
    renderSurface();

    // Let 2 minutes elapse — short of the 5-minute box, the round is still live.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(screen.getByAltText("Pair")).toBeInTheDocument();

    // Switch to a 1-minute box: already past. It expires gently (against the
    // unchanged start) — the content is replaced by the recap.
    fireEvent.change(screen.getByRole("combobox", { name: "Round length" }), {
      target: { value: "1" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(screen.queryByAltText("Pair")).not.toBeInTheDocument();
  });

  it("the chooser shows while the round is live and disappears when it ends into the recap", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "1"); // a 1-minute box so the live round expires in place
    renderSurface();

    // Live: the chooser is present.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("combobox", { name: "Round length" })).toBeInTheDocument();

    // Drive the real live→recap transition in place: let the box expire, and the
    // recap replaces the content — the chooser (live-only) goes with it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000 + 1_500);
    });
    expect(screen.queryByRole("combobox", { name: "Round length" })).not.toBeInTheDocument();
  });
});
