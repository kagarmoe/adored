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

const TARGETS = [{ id: "i9", number: 9, name: "Red clutch" }];

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
    expect(screen.queryByRole("button", { name: /group into an item/i })).not.toBeInTheDocument();
  });

  it("requests the resized pool-tile width (w=320) for every tile", () => {
    const { container } = render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(PHOTOS.length);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toContain("/pool/photos/");
      expect(img.getAttribute("src")).toContain("w=320");
    }
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
    expect(screen.queryByRole("button", { name: /group into an item/i })).not.toBeInTheDocument();
    expect(tile("one")).toHaveAttribute("aria-pressed", "false");
  });

  it("on success: posts ordered ids, removes the tiles, clears, and confirms with a link to the item", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("two")); // first selected -> hero
    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/pool/group",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: ["p2", "p1"] }),
      }),
    ));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i));
    const link = screen.getByRole("link", { name: /take a look/i });
    expect(link).toHaveAttribute("href", "/collections/c1/items/7");
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /one/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it('"Make each its own" is hidden with one selected, shown with two', async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    expect(screen.queryByRole("button", { name: /each photo its own item/i })).not.toBeInTheDocument();

    await user.click(tile("two"));
    expect(screen.getByRole("button", { name: /each photo its own item/i })).toBeInTheDocument();
  });

  it('"Make each its own" posts mode "each", confirms the count with a link to the items list, and removes the tiles', async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ count: 2 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /each photo its own item/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1/pool/group",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: ["p1", "p2"], mode: "each" }),
      }),
    ));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/2 items are ready/i));
    const link = screen.getByRole("link", { name: /see them all/i });
    expect(link).toHaveAttribute("href", "/collections/c1/items");
    expect(screen.queryByRole("button", { name: /one/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("on failure: surfaces the server's own message and keeps the selection", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Some of those photos aren't available to group anymore — try again." }),
    });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));

    await waitFor(() =>
      expect(screen.getByText(/some of those photos aren.t available to group/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(tile("one")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("on failure without a usable server message: falls back to the generic copy", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn’t make that item.*try again/i)).toBeInTheDocument(),
    );
  });

  it("on failure with a non-JSON body: falls back to the generic copy", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn’t make that item.*try again/i)).toBeInTheDocument(),
    );
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
    await user.click(screen.getByRole("button", { name: /group into an item/i }));

    // in flight: the action shows "Making…" and is disabled
    const making = screen.getByRole("button", { name: /making/i });
    expect(making).toBeDisabled();

    // a second click while busy does not fire another request
    await user.click(making);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ number: 9 }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/item #9 is ready/i));
  });

  it("does NOT auto-dismiss the link-bearing success notice after the timeout", async () => {
    // Fake timers throughout: drive clicks with fireEvent (synchronous, no
    // userEvent internal delays) so there's no userEvent/fake-timer deadlock.
    vi.useFakeTimers();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    try {
      render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);
      fireEvent.click(tile("one"));
      fireEvent.click(screen.getByRole("button", { name: /group into an item/i }));

      // flush the fetch + json microtasks so the notice gets set
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the success notice on the next selection change (toggle)", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i));

    await user.click(tile("three"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears the success notice when Clear is pressed", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i));

    await user.click(tile("three")); // re-select something so Clear renders (bar hides at 0)
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears the success notice when a move action completes (linking to the new destination)", async () => {
    const user = userEvent.setup();
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ number: 7 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ number: 9 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("one"));
    await user.click(screen.getByRole("button", { name: /group into an item/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/item #7 is ready/i));

    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /red clutch/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/moved/i));
    expect(screen.queryByText(/item #7 is ready/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /take a look/i })).toHaveAttribute(
      "href",
      "/collections/c1/items/9",
    );
  });
});

describe("PoolPhotoGrid selected-tile styling", () => {
  it("selected tile carries a teal border and aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    const one = tile("one");
    expect(one).toHaveAttribute("aria-pressed", "false");
    expect(one).toHaveClass("border-transparent");

    await user.click(one);

    expect(one).toHaveAttribute("aria-pressed", "true");
    expect(one).toHaveClass("border-2", "border-primary");
  });

  it("selected[0] renders the Cover pill; later selections render the ✓ badge", async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("one"));
    await user.click(tile("two"));

    expect(tile("one")).toHaveTextContent("Cover");
    expect(tile("two")).toHaveTextContent("✓");
    expect(tile("two")).not.toHaveTextContent("Cover");
  });

  it("deselecting the cover promotes the next-tapped photo's badge", async () => {
    const user = userEvent.setup();
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("one")); // cover
    await user.click(tile("two"));
    await user.click(tile("one")); // deselect the cover

    expect(tile("two")).toHaveTextContent("Cover");
  });
});

describe("PoolPhotoGrid Move to…", () => {
  it("opens the chooser and moves selected photos to a new item via the reassign API", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 5 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/collections/c1/photos/reassign",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: ["p2"], destination: { type: "new" } }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/their own item/i));
    expect(screen.getByRole("link", { name: /take a look/i })).toHaveAttribute(
      "href",
      "/collections/c1/items/5",
    );
    expect(screen.queryByRole("button", { name: /two/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /three/i })).toBeInTheDocument();
  });

  it("moves selected photos onto an existing item target", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ number: 9 }) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /red clutch/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/collections/c1/photos/reassign",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoIds: ["p2"], destination: { type: "item", itemId: "i9" } }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/moved/i));
    expect(screen.getByRole("link", { name: /take a look/i })).toHaveAttribute(
      "href",
      "/collections/c1/items/9",
    );
  });

  it("on move failure surfaces the server's own message and keeps the selection", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "That item isn't available anymore — try again." }),
    });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/that item isn.t available anymore/i),
    );
    expect(tile("two")).toHaveAttribute("aria-pressed", "true");
  });

  it("on move failure without a usable server message: falls back to the generic copy", async () => {
    const user = userEvent.setup();
    (fetch as any).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<PoolPhotoGrid collectionId="c1" photos={PHOTOS} targets={TARGETS} />);

    await user.click(tile("two"));
    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t move.*try again/i));
  });
});
