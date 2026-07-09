// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { RerankPanel, type RerankRow } from "./RerankPanel";
import {
  PUT_IN_ORDER,
  DONE_ARRANGING,
  BACK_TO_COMPUTED,
  MAKE_A_REVISION,
  moveUpLabel,
  moveDownLabel,
} from "./rerank-copy";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function makeRows(): RerankRow[] {
  return [
    { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0 },
    { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1 },
    { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2 },
  ];
}

/** The visible names, top→bottom, of the reorder rows. */
function rowNames(): string[] {
  return screen.getAllByTestId("rerank-row").map((li) => within(li).getByText(/tote|clutch|bag/).textContent ?? "");
}

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
}

/** The parsed `order` body of the Nth fetch call (0-based). */
function orderOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): Array<{ rid: string; manualRank: number }> {
  const body = JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
  return body.order;
}

beforeEach(() => {
  pushMock.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDraft(rows = makeRows()) {
  return render(
    <RerankPanel resultId="res_1" collectionId="my-bags" status="draft" rows={rows}>
      <div>NORMAL VIEW</div>
    </RerankPanel>,
  );
}

function enterReorder() {
  fireEvent.click(screen.getByRole("button", { name: PUT_IN_ORDER }));
}

describe("RerankPanel — enter/leave reorder mode", () => {
  it("shows the normal composition until 'Put in order by hand', then the reorder list", () => {
    renderDraft();
    expect(screen.getByText("NORMAL VIEW")).toBeInTheDocument();
    expect(screen.queryByTestId("rerank-row")).toBeNull();
    enterReorder();
    expect(screen.queryByText("NORMAL VIEW")).toBeNull();
    expect(screen.getAllByTestId("rerank-row")).toHaveLength(3);
    // The toggle flips to a "Done" affordance.
    expect(screen.getByRole("button", { name: DONE_ARRANGING })).toBeInTheDocument();
  });
});

describe("RerankPanel — drag reorder issues ONE bulk PATCH with the new dense order", () => {
  it("dragging the first row to the last position PATCHes the whole recomputed sequence once", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft();
    enterReorder();
    const rows = screen.getAllByTestId("rerank-row");
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sort-results/res_1/items");
    expect((init as RequestInit).method).toBe("PATCH");
    // Aqua moved to the end → dense 0..2 over [Blue, Cream, Aqua].
    expect(orderOf(fetchMock)).toEqual([
      { rid: "ri_b", manualRank: 0 },
      { rid: "ri_c", manualRank: 1 },
      { rid: "ri_a", manualRank: 2 },
    ]);
    expect(rowNames()).toEqual(["Blue clutch", "Cream bag", "Aqua tote"]);
  });
});

describe("RerankPanel — optimistic update + rollback on PATCH failure", () => {
  it("reverts to the prior order when the bulk PATCH fails (nothing lost)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    renderDraft();
    enterReorder();
    const rows = screen.getAllByTestId("rerank-row");
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[2]);

    // Optimistically the order changed...
    expect(rowNames()).toEqual(["Blue clutch", "Cream bag", "Aqua tote"]);
    // ...then the failed PATCH rolls it back to the original.
    await waitFor(() => expect(rowNames()).toEqual(["Aqua tote", "Blue clutch", "Cream bag"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("RerankPanel — keyboard move-up / move-down issues the adjacent-swap PATCH", () => {
  it("move-up on the 2nd row swaps it above and PATCHes the recomputed order once", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft();
    enterReorder();
    fireEvent.click(screen.getByRole("button", { name: moveUpLabel("Blue clutch") }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(orderOf(fetchMock)).toEqual([
      { rid: "ri_b", manualRank: 0 },
      { rid: "ri_a", manualRank: 1 },
      { rid: "ri_c", manualRank: 2 },
    ]);
    expect(rowNames()).toEqual(["Blue clutch", "Aqua tote", "Cream bag"]);
  });

  it("disables move-up on the first row and move-down on the last (ends are fixed)", () => {
    renderDraft();
    enterReorder();
    expect(screen.getByRole("button", { name: moveUpLabel("Aqua tote") })).toBeDisabled();
    expect(screen.getByRole("button", { name: moveDownLabel("Cream bag") })).toBeDisabled();
  });

  it("keeps focus on the moved item's control after a keyboard move (§4.3 AA)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft();
    enterReorder();
    fireEvent.click(screen.getByRole("button", { name: moveDownLabel("Aqua tote") }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Aqua is now the 2nd row; focus stayed on its move-down control.
    expect(screen.getByRole("button", { name: moveDownLabel("Aqua tote") })).toHaveFocus();
  });
});

describe("RerankPanel — reset to the computed order (DELETE)", () => {
  it("'Back to the computed order' re-sorts by computedRank and DELETEs once", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    // Seed a hand-order that differs from computedRank so the reset is observable.
    renderDraft([
      { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2 },
      { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0 },
      { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1 },
    ]);
    enterReorder();
    expect(rowNames()).toEqual(["Cream bag", "Aqua tote", "Blue clutch"]);
    fireEvent.click(screen.getByRole("button", { name: BACK_TO_COMPUTED }));
    // Optimistic revert to computedRank order.
    expect(rowNames()).toEqual(["Aqua tote", "Blue clutch", "Cream bag"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sort-results/res_1/items");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });
});

describe("RerankPanel — role=status announces the move", () => {
  it("announces 'Moved {name} to position N of M' after a move", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft();
    enterReorder();
    fireEvent.click(screen.getByRole("button", { name: moveDownLabel("Aqua tote") }));
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Moved Aqua tote to position 2 of 3."));
  });
});

describe("RerankPanel — a11y affordance sizing + reduced motion", () => {
  it("gives the handle and both move controls a ≥44px (h-11 w-11) target", () => {
    renderDraft();
    enterReorder();
    const firstRow = screen.getAllByTestId("rerank-row")[0];
    // The move controls.
    for (const btn of within(firstRow).getAllByRole("button")) {
      expect(btn.className).toMatch(/h-11/);
      expect(btn.className).toMatch(/w-11/);
    }
    // The drag handle (aria-hidden, so query by its title).
    const handle = firstRow.querySelector('[title^="Reorder"]')!;
    expect(handle.className).toMatch(/h-11/);
    expect(handle.className).toMatch(/w-11/);
  });

  it("disables the reorder transition under prefers-reduced-motion", () => {
    renderDraft();
    enterReorder();
    const firstRow = screen.getAllByTestId("rerank-row")[0];
    expect(firstRow.className).toMatch(/motion-reduce:transition-none/);
  });
});

describe("RerankPanel — finalized guard (§4.4)", () => {
  it("shows NO reorder affordance on a finalized result and offers 'Make a revision'", () => {
    render(
      <RerankPanel resultId="res_1" collectionId="my-bags" status="finalized" rows={makeRows()}>
        <div>NORMAL VIEW</div>
      </RerankPanel>,
    );
    expect(screen.queryByRole("button", { name: PUT_IN_ORDER })).toBeNull();
    expect(screen.queryByTestId("rerank-row")).toBeNull();
    expect(screen.getByRole("button", { name: MAKE_A_REVISION })).toBeInTheDocument();
    // The normal composition is still shown beneath the revision affordance.
    expect(screen.getByText("NORMAL VIEW")).toBeInTheDocument();
  });

  it("'Make a revision' POSTs supersede and routes to the fresh draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RerankPanel resultId="res_1" collectionId="my-bags" status="finalized" rows={makeRows()}>
        <div>NORMAL VIEW</div>
      </RerankPanel>,
    );
    fireEvent.click(screen.getByRole("button", { name: MAKE_A_REVISION }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sort-results/res_1/supersede");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/collections/my-bags/results/7"));
  });
});
