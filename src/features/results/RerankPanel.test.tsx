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
  HANDORDER_ONWARD_LABEL,
  ZONE_LOVED_LABEL,
  ZONE_ONWARD_LABEL,
  moveUpLabel,
  moveDownLabel,
} from "./rerank-copy";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));

/** Three loved rows (top/high/medium) — one group, sentinel at the end. */
function makeRows(): RerankRow[] {
  return [
    { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0, computedBucket: "top" },
    { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1, computedBucket: "high" },
    { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2, computedBucket: "medium" },
  ];
}

/** Two loved + one onward (top/high/low) — mirrors seedSortScenario; the sentinel
 *  sits between Blue and Cream. Display order: loved first, then onward. */
function makeMixedRows(): RerankRow[] {
  return [
    { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0, computedBucket: "top" },
    { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1, computedBucket: "high" },
    { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2, computedBucket: "low" },
  ];
}

const lovedCountOf = (rows: RerankRow[]) => rows.filter((r) => r.computedBucket !== "low").length;

/** The visible names, top→bottom, of the reorder rows. */
function rowNames(): string[] {
  return screen.getAllByTestId("rerank-row").map((li) => within(li).getByText(/tote|clutch|bag/).textContent ?? "");
}

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
}

/** The parsed `order` body of the Nth fetch call (0-based). Each entry now carries
 *  manualBucket (value or null) — the full overlay the batch describes. */
function orderOf(
  fetchMock: ReturnType<typeof vi.fn>,
  call = 0,
): Array<{ rid: string; manualRank: number; manualBucket: string | null }> {
  const body = JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
  return body.order;
}

beforeEach(() => {
  pushMock.mockClear();
  refreshMock.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDraft(rows = makeRows()) {
  return render(
    <RerankPanel
      resultId="res_1"
      collectionId="my-bags"
      status="draft"
      rows={rows}
      lovedCount={lovedCountOf(rows)}
    >
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
    // Aqua moved to the end → dense 1..3 over [Blue, Cream, Aqua] (manualRank
    // shares computedRank's 1-indexed space).
    expect(orderOf(fetchMock)).toEqual([
      { rid: "ri_b", manualRank: 1, manualBucket: null },
      { rid: "ri_c", manualRank: 2, manualBucket: null },
      { rid: "ri_a", manualRank: 3, manualBucket: null },
    ]);
    expect(rowNames()).toEqual(["Blue clutch", "Cream bag", "Aqua tote"]);
    // The server-composed keepsake view (children) is materialized at load, so a
    // SUCCESSFUL reorder refreshes it to reveal the new order without a reload.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
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
    // A FAILED reorder must NOT refresh (the rollback is the whole state change).
    expect(refreshMock).not.toHaveBeenCalled();
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
      { rid: "ri_b", manualRank: 1, manualBucket: null },
      { rid: "ri_a", manualRank: 2, manualBucket: null },
      { rid: "ri_c", manualRank: 3, manualBucket: null },
    ]);
    expect(rowNames()).toEqual(["Blue clutch", "Aqua tote", "Cream bag"]);
  });

  it("disables move-up on the first row and move-down on the last (sequence ends are fixed)", () => {
    // Mixed fixture: the sentinel sits between Blue (loved) and Cream (onward), so
    // Cream is the true last element — its ↓ is disabled. Aqua is the top — its ↑ is.
    renderDraft(makeMixedRows());
    enterReorder();
    expect(screen.getByRole("button", { name: moveUpLabel("Aqua tote") })).toBeDisabled();
    expect(screen.getByRole("button", { name: moveDownLabel("Cream bag") })).toBeDisabled();
    // The bottom LOVED row (Blue) can now move DOWN — across the sentinel into Onward.
    expect(screen.getByRole("button", { name: moveDownLabel("Blue clutch") })).not.toBeDisabled();
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
      { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2, computedBucket: "medium" },
      { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0, computedBucket: "top" },
      { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1, computedBucket: "high" },
    ]);
    enterReorder();
    expect(rowNames()).toEqual(["Cream bag", "Aqua tote", "Blue clutch"]);
    fireEvent.click(screen.getByRole("button", { name: BACK_TO_COMPUTED }));
    // Optimistic revert to computedRank order.
    expect(rowNames()).toEqual(["Aqua tote", "Blue clutch", "Cream bag"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sort-results/res_1/items");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    // A successful reset refreshes the server-composed keepsake view.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("a FAILED reset rolls back the order and does NOT refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    renderDraft([
      { rid: "ri_c", itemId: "c", name: "Cream bag", computedRank: 2, computedBucket: "medium" },
      { rid: "ri_a", itemId: "a", name: "Aqua tote", computedRank: 0, computedBucket: "top" },
      { rid: "ri_b", itemId: "b", name: "Blue clutch", computedRank: 1, computedBucket: "high" },
    ]);
    enterReorder();
    fireEvent.click(screen.getByRole("button", { name: BACK_TO_COMPUTED }));
    // Optimistic revert, then rollback to the seeded hand-order on failure.
    await waitFor(() => expect(rowNames()).toEqual(["Cream bag", "Aqua tote", "Blue clutch"]));
    expect(refreshMock).not.toHaveBeenCalled();
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

describe("RerankPanel — cross-tier hand-order (9v1f.1)", () => {
  const zoneOf = (name: string) =>
    screen.getAllByTestId("rerank-row").find((li) => within(li).queryByText(name))?.getAttribute("data-zone");

  it("promoting the Onward item up across the sentinel writes manualBucket 'medium'", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft(makeMixedRows());
    enterReorder();
    // Cream (onward) → move up across the sentinel into the loved ranking.
    fireEvent.click(screen.getByRole("button", { name: moveUpLabel("Cream bag") }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(orderOf(fetchMock)).toEqual([
      { rid: "ri_a", manualRank: 1, manualBucket: null }, // stays loved (computed top)
      { rid: "ri_b", manualRank: 2, manualBucket: null }, // stays loved (computed high)
      { rid: "ri_c", manualRank: 3, manualBucket: "medium" }, // crossed low→loved
    ]);
    expect(zoneOf("Cream bag")).toBe("loved");
    expect(screen.getByRole("status")).toHaveTextContent("Moved Cream bag into your ranking, position 3 of 3.");
  });

  it("demoting the bottom loved item down across the sentinel writes manualBucket 'low'", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft(makeMixedRows());
    enterReorder();
    // Blue (bottom loved) → move down across the sentinel into Onward.
    fireEvent.click(screen.getByRole("button", { name: moveDownLabel("Blue clutch") }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(orderOf(fetchMock)).toEqual([
      { rid: "ri_a", manualRank: 1, manualBucket: null }, // stays loved
      { rid: "ri_b", manualRank: 2, manualBucket: "low" }, // crossed high→onward
      { rid: "ri_c", manualRank: 3, manualBucket: null }, // stays onward (computed low)
    ]);
    expect(zoneOf("Blue clutch")).toBe("onward");
    expect(screen.getByRole("status")).toHaveTextContent("Moved Blue clutch to Onward, position 2 of 3.");
  });

  it("an EMPTY Onward zone is reachable: the last loved row's ↓ crosses the end sentinel", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft(makeRows()); // all loved → sentinel at the end, Onward empty
    enterReorder();
    expect(screen.getAllByTestId("rerank-row")[0].getAttribute("data-zone")).toBe("loved");
    fireEvent.click(screen.getByRole("button", { name: moveDownLabel("Cream bag") }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Cream crossed into the (previously empty) Onward group.
    expect(orderOf(fetchMock)[2]).toEqual({ rid: "ri_c", manualRank: 3, manualBucket: "low" });
    expect(zoneOf("Cream bag")).toBe("onward");
  });

  it("dragging the Onward item above the sentinel re-buckets it into the ranking", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDraft(makeMixedRows());
    enterReorder();
    const rows = screen.getAllByTestId("rerank-row"); // [Aqua, Blue, Cream]
    fireEvent.dragStart(rows[2]); // Cream (onward)
    fireEvent.drop(rows[0]); // onto Aqua (top of loved)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const cream = orderOf(fetchMock).find((o) => o.rid === "ri_c");
    expect(cream).toEqual({ rid: "ri_c", manualRank: 1, manualBucket: "medium" });
    expect(zoneOf("Cream bag")).toBe("loved");
  });

  it("exposes the Onward boundary and each row's group membership to AT", () => {
    renderDraft(makeMixedRows());
    enterReorder();
    // The sentinel is a real, labelled divider element.
    expect(screen.getByTestId("rerank-onward-divider")).toHaveTextContent(HANDORDER_ONWARD_LABEL);
    // Each row carries a visually-hidden zone label so membership is statically perceivable.
    const lovedRow = screen.getAllByTestId("rerank-row").find((li) => within(li).queryByText("Aqua tote"))!;
    expect(within(lovedRow).getByText(ZONE_LOVED_LABEL)).toBeInTheDocument();
    const onwardRow = screen.getAllByTestId("rerank-row").find((li) => within(li).queryByText("Cream bag"))!;
    expect(within(onwardRow).getByText(ZONE_ONWARD_LABEL)).toBeInTheDocument();
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
  it("shows NO reorder affordance on a finalized result and offers 'Make a revision' to the curator", () => {
    render(
      <RerankPanel resultId="res_1" collectionId="my-bags" status="finalized" canRevise rows={makeRows()}>
        <div>NORMAL VIEW</div>
      </RerankPanel>,
    );
    expect(screen.queryByRole("button", { name: PUT_IN_ORDER })).toBeNull();
    expect(screen.queryByTestId("rerank-row")).toBeNull();
    expect(screen.getByRole("button", { name: MAKE_A_REVISION })).toBeInTheDocument();
    // The normal composition is still shown beneath the revision affordance.
    expect(screen.getByText("NORMAL VIEW")).toBeInTheDocument();
  });

  it("hides 'Make a revision' for a NON-curator (canRevise=false), still shows the keepsake", () => {
    render(
      <RerankPanel resultId="res_1" collectionId="my-bags" status="finalized" canRevise={false} rows={makeRows()}>
        <div>NORMAL VIEW</div>
      </RerankPanel>,
    );
    // A non-curator collaborator is never offered to fork someone else's keepsake.
    expect(screen.queryByRole("button", { name: MAKE_A_REVISION })).toBeNull();
    expect(screen.queryByRole("button", { name: PUT_IN_ORDER })).toBeNull();
    expect(screen.getByText("NORMAL VIEW")).toBeInTheDocument();
  });

  it("'Make a revision' POSTs supersede and routes to the fresh draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ number: 7 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RerankPanel resultId="res_1" collectionId="my-bags" status="finalized" canRevise rows={makeRows()}>
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
