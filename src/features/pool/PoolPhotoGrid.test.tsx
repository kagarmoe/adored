// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolPhotoGrid } from "./PoolPhotoGrid";

const PHOTOS = [
  { id: "p1", filename: "one.jpg" },
  { id: "p2", filename: "two.jpg" },
  { id: "p3", filename: "three.jpg" },
];

function tile(which: "one" | "two" | "three") {
  return screen.getByRole("button", { name: new RegExp(which) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PoolPhotoGrid selection + grouping", () => {
  it("shows no action bar until a photo is selected", () => {
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);
    expect(screen.queryByRole("button", { name: /make an item/i })).not.toBeInTheDocument();
  });

  it("toggles selection and reflects the count; Clear deselects", async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    expect(tile("one")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /grouping actions/i })).toBeInTheDocument();

    await user.click(tile("two"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByRole("button", { name: /make an item/i })).not.toBeInTheDocument();
    expect(tile("one")).toHaveAttribute("aria-pressed", "false");
  });

  it("on success: posts ordered ids, removes the tiles, clears, and confirms with the number", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("two")); // first selected -> hero
    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /make an item/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/pool/group",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: ["p2", "p1"] }),
      }),
    ));
    await waitFor(() => expect(screen.getByText(/your photos are grouped/i)).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/grouped.*#7|#7.*grouped/i);
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /one/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it('"Make each its own" is hidden with one selected, shown with two', async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    expect(screen.queryByRole("button", { name: /make each its own/i })).not.toBeInTheDocument();

    await user.click(tile("two"));
    expect(screen.getByRole("button", { name: /make each its own/i })).toBeInTheDocument();
  });

  it('"Make each its own" posts mode "each", confirms the count, and removes the tiles', async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ count: 2 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /make each its own/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/pool/group",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: ["p1", "p2"], mode: "each" }),
      }),
    ));
    await waitFor(() => expect(screen.getByText(/made 2 items/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /one/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("on failure: keeps the selection and shows an error", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "gone" }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /make an item/i }));

    await waitFor(() => expect(screen.getByText(/couldn’t make that item|try again/i)).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(tile("one")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("guards against double-submit while a group is in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as any).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /make an item/i }));

    // in flight: the action shows "Making…" and is disabled
    const making = screen.getByRole("button", { name: /making/i });
    expect(making).toBeDisabled();

    // a second click while busy does not fire another request
    await user.click(making);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ number: 9 }) });
    await waitFor(() => expect(screen.getByText(/your photos are grouped/i)).toBeInTheDocument());
  });

  it("auto-dismisses the success confirmation after the timeout", async () => {
    // Fake timers throughout: drive clicks with fireEvent (synchronous, no
    // userEvent internal delays) so there's no userEvent/fake-timer deadlock.
    vi.useFakeTimers();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    try {
      render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);
      fireEvent.click(tile("one"));
      fireEvent.click(screen.getByRole("button", { name: /make an item/i }));

      // flush the fetch + json microtasks so the notice gets set
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText(/grouped/i)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(screen.queryByText(/grouped/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
