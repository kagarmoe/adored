// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RoundSurface } from "./RoundSurface";

// jsdom does not implement the Pointer Capture API — TimerDial's onPointerDown
// calls it, so it's stubbed for every test that opens the length dialog.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
  });
});

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

// Opens the mid-round length dialog and commits `box` via the keyboard (Home
// then ArrowUp `steps` times) — avoids depending on the dial's current value.
function commitBoxViaDialog(steps: number) {
  fireEvent.click(screen.getByRole("button", { name: "Change round length" }));
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "Home" }); // "none"
  for (let i = 0; i < steps; i++) fireEvent.keyDown(slider, { key: "ArrowUp" });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
}

describe("RoundSurface round-length dialog (compare, spec §3.1, Task 6)", () => {
  it("mid-round switch to 'No timer' removes the countdown and the round never expires", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "1"); // start with a 1-minute box
    renderSurface();

    // The countdown is live.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("timer")).toBeInTheDocument();

    // Switch to No timer mid-round (Home = "none"): countdown gone, and
    // advancing well past the old box never ends the round.
    commitBoxViaDialog(0);
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

    // Commit a 1-minute box (Home then 2 ArrowUp: none→30→60): already past. It
    // expires gently (against the unchanged start) — the content is replaced by
    // the recap.
    commitBoxViaDialog(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(screen.queryByAltText("Pair")).not.toBeInTheDocument();
  });

  it("the adjust affordance shows while the round is live and disappears when it ends into the recap", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "1"); // a 1-minute box so the live round expires in place
    renderSurface();

    // Live: the adjust button is present.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("button", { name: "Change round length" })).toBeInTheDocument();

    // Drive the real live→recap transition in place: let the box expire, and the
    // recap replaces the content — the adjust button (live-only) goes with it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000 + 1_500);
    });
    expect(screen.queryByRole("button", { name: "Change round length" })).not.toBeInTheDocument();
  });

  it("committing a LARGER box mid-round re-arms against the unchanged start (no reset)", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "1"); // start with a 1-minute box
    renderSurface();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 45s in — still under the 1-minute box.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(screen.getByRole("timer")).toBeInTheDocument();

    // Commit the max 5-minute box (Home then 10 ArrowUp: none→30→…→300) against
    // the UNCHANGED start (45s already elapsed).
    commitBoxViaDialog(10);

    // 30s later (75s total elapsed): a re-arm against the unchanged start reads
    // ~4 minutes left (300-75s → ceil(225s/60s)=4). A reset-to-a-fresh-start bug
    // would instead read ~5 minutes (300-30s → ceil(270s/60s)=5) — the sr-only
    // remaining-time text is what distinguishes the two.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText(/about 4 minutes left in this round/i)).toBeInTheDocument();
  });
});
