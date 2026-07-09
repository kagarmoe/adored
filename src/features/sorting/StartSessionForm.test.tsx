// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { StartSessionForm, TIMED_BOX_HELPER, NO_TIMER_HELPER } from "./StartSessionForm";
import { getRoundBox, ROUND_BOX_OPTIONS } from "@/lib/round-preference";

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
});

describe("StartSessionForm", () => {
  it("POSTs the collection ULID, then redirects DIRECTLY to triage (slug + session number)", async () => {
    render(<StartSessionForm collectionId="coll_01ULID" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/4/triage"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID"); // API body uses the ULID, not the slug
  });

  it("renders the round-length options from the one home (ROUND_BOX_OPTIONS), 'No timer' a first-class peer", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i });
    const opts = Array.from(select.querySelectorAll("option"));
    // List identity against the single source of truth — never re-pin the label strings.
    expect(opts.map((o) => o.value)).toEqual(ROUND_BOX_OPTIONS.map((o) => String(o.value)));
    expect(opts.map((o) => o.textContent)).toEqual(ROUND_BOX_OPTIONS.map((o) => o.label));
  });

  it("defaults the selection to the gentle 2-minute round box", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i }) as HTMLSelectElement;
    expect(select.value).toBe("2");
  });

  it("shows a quiet helper keyed to the selection — timed vs 'No timer'", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i });

    // Default is a timed box → the gentle timed helper.
    expect(screen.getByText(TIMED_BOX_HELPER)).toBeInTheDocument();
    expect(screen.queryByText(NO_TIMER_HELPER)).not.toBeInTheDocument();

    // Choosing "No timer" swaps the helper to the no-pressure line.
    fireEvent.change(select, { target: { value: "none" } });
    expect(screen.getByText(NO_TIMER_HELPER)).toBeInTheDocument();
    expect(screen.queryByText(TIMED_BOX_HELPER)).not.toBeInTheDocument();
  });

  it("persists the chosen box to the device-local round preference (not the DB)", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i });

    fireEvent.change(select, { target: { value: "0.5" } });
    expect(getRoundBox()).toBe(0.5);

    fireEvent.change(select, { target: { value: "none" } });
    expect(getRoundBox()).toBe("none");
  });
});
