// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { StartSessionForm } from "./StartSessionForm";
import { getRoundBox } from "@/lib/round-preference";

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

  it("offers the round-length options including a 'No timer' path (a11y 2.2.1)", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i });
    const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(labels).toEqual(["5 minutes", "10 minutes", "20 minutes", "No timer"]);
  });

  it("defaults the selection to the gentle 10-minute round box", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i }) as HTMLSelectElement;
    expect(select.value).toBe("10");
  });

  it("persists the chosen box to the device-local round preference (not the DB)", () => {
    render(<StartSessionForm collectionId="c" collectionSlug="s" />);
    const select = screen.getByRole("combobox", { name: /round length/i });

    fireEvent.change(select, { target: { value: "20" } });
    expect(getRoundBox()).toBe(20);

    fireEvent.change(select, { target: { value: "none" } });
    expect(getRoundBox()).toBe("none");
  });
});
