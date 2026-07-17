// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { StartSessionForm, TIMED_BOX_HELPER, NO_TIMER_HELPER } from "./StartSessionForm";
import { getRoundBox } from "@/lib/round-preference";

// Mirrors StartSessionForm's inlined TIMEBOX_OPTIONS (short-lived — the dial
// replaces this select in Task 7).
const TIMEBOX_OPTIONS = [
  { value: "30", label: "30 seconds" },
  { value: "60", label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "300", label: "5 minutes" },
  { value: "none", label: "No timer" },
];

// jsdom here does not expose a working localStorage on file:// URLs (same as
// round-preference.test); install a minimal Map-backed Storage so the persistence
// assertions run against a real getItem/setItem round-trip.
function installStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      get length() { return map.size; },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    },
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installStorage();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "sess_01ABC", number: 4 }) }));
  // jsdom does not implement Pointer Capture API — stub it so TimerDial's onPointerDown doesn't throw
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

describe("StartSessionForm", () => {
  it("POSTs the collection ULID, then redirects DIRECTLY to triage (slug + session number)", async () => {
    render(<StartSessionForm collectionId="coll_01ULID" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/4/triage"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID"); // API body uses the ULID, not the slug
  });

  it("renders the dial with slider role and round-length aria-label", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const dial = screen.getByRole("slider", { name: /round length/i });
    expect(dial).toBeInTheDocument();
    expect(dial).toHaveAttribute("aria-valuenow", "120");
  });

  it("defaults the dial to the gentle 2-minute round box", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const dial = screen.getByRole("slider", { name: /round length/i });
    expect(dial).toHaveAttribute("aria-valuenow", "120");
  });

  it("shows a quiet helper keyed to the dial value — timed vs 'No timer'", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const dial = screen.getByRole("slider", { name: /round length/i });

    // Default is a timed box → the gentle timed helper.
    expect(screen.getByText(TIMED_BOX_HELPER)).toBeInTheDocument();
    expect(screen.queryByText(NO_TIMER_HELPER)).not.toBeInTheDocument();

    // Pressing Home sets to "none" and swaps the helper to the no-pressure line.
    fireEvent.keyDown(dial, { key: "Home" });
    expect(screen.getByText(NO_TIMER_HELPER)).toBeInTheDocument();
    expect(screen.queryByText(TIMED_BOX_HELPER)).not.toBeInTheDocument();
  });

  it("persists the chosen box to the device-local round preference (not the DB) via dial keyboard", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const dial = screen.getByRole("slider", { name: /round length/i });

    // ArrowUp steps from 120 to 150 and persists
    fireEvent.keyDown(dial, { key: "ArrowUp" });
    expect(getRoundBox()).toBe(150);

    // Home sets to "none" and persists
    fireEvent.keyDown(dial, { key: "Home" });
    expect(getRoundBox()).toBe("none");
  });
});
