// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareChoice } from "./CompareChoice";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const item = (id: string, name: string) => ({
  id,
  collectionId: "c",
  number: id === "a" ? 1 : 2,
  name,
  brand: null,
  status: "active",
});

/** Read the decision body of the Nth (default first) fetch call. */
function decisionBody(call = 0) {
  return JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[call][1].body as string);
}

describe("CompareChoice images", () => {
  it("browser-loads authenticated hero image URLs directly", () => {
    render(
      <CompareChoice
        sessionId="s"
        itemA={item("a", "Bag A") as any}
        itemB={item("b", "Bag B") as any}
        heroA="/api/collections/c/items/a/photos/pa/file"
        heroB="/api/collections/c/items/b/photos/pb/file"
        comparisonsMade={0}
      />,
    );
    expect(screen.getByRole("img", { name: "Bag A" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/a/photos/pa/file",
    );
    expect(screen.getByRole("img", { name: "Bag B" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/b/photos/pb/file",
    );
  });
});

describe("CompareChoice tap chooses an item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderChoice() {
    render(
      <CompareChoice
        sessionId="s"
        itemA={item("a", "Bag A") as any}
        itemB={item("b", "Bag B") as any}
        comparisonsMade={0}
      />,
    );
  }

  it("tapping item A's card POSTs a pairwise_compare with result=item_a (the two item ids preserved)", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/s/decisions");
    expect(init.method).toBe("POST");
    const body = decisionBody();
    expect(body.type).toBe("pairwise_compare");
    expect(body.decision).toEqual({ itemAId: "a", itemBId: "b", result: "item_a" });
  });

  it("tapping item B's card chooses item_b — proving the card, not a fixed slot, drives the result", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag B" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(decisionBody().decision.result).toBe("item_b");
  });

  it("refreshes the route after a chosen card saves", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("the Tie escape hatch sends result=tie", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Tie" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(decisionBody().decision).toEqual({ itemAId: "a", itemBId: "b", result: "tie" });
  });

  it("the Skip escape hatch sends result=skip", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(decisionBody().decision.result).toBe("skip");
  });

  // Fix 3: the POST carries a clientKey so the server idempotency path is live —
  // a timed-out-then-retried compare returns the same event instead of inserting
  // a duplicate that would corrupt comparison counts / ordering.
  it("includes a non-empty clientKey in the pairwise POST body", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(typeof decisionBody().clientKey).toBe("string");
    expect(decisionBody().clientKey.length).toBeGreaterThan(0);
  });

  it("reuses the SAME clientKey when the SAME tap is retried after a failure", async () => {
    // First attempt fails (res.ok === false) — the client surfaces the error and
    // does NOT advance, so re-tapping the same card is a RETRY of that decision.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    expect(await screen.findByText("That didn't save. Try again.")).toBeInTheDocument();

    // Retry the same card.
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(decisionBody(1).clientKey).toBe(decisionBody(0).clientKey);
  });

  it("uses a DIFFERENT clientKey for a genuinely new tap (a fresh comparison)", async () => {
    // A new comparison arrives as a fresh mount (router.refresh re-renders the
    // server tree with the next pair). A new tap must carry its own fresh key —
    // never a stale one — so distinct decisions never collide on idempotency.
    const user = userEvent.setup();
    const { unmount } = render(
      <CompareChoice
        sessionId="s"
        itemA={item("a", "Bag A") as any}
        itemB={item("b", "Bag B") as any}
        comparisonsMade={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    unmount();

    render(
      <CompareChoice
        sessionId="s"
        itemA={item("a", "Bag A") as any}
        itemB={item("b", "Bag B") as any}
        comparisonsMade={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    expect(decisionBody(1).clientKey).not.toBe(decisionBody(0).clientKey);
  });

  it("surfaces a gentle error (no refresh) and re-enables the choices when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));

    expect(await screen.findByText("That didn't save. Try again.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose Bag B" })).toBeEnabled();
  });
});
