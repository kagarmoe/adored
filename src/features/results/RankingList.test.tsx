// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RankingList, type RankingRow } from "./RankingList";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const row = (itemId: string, name: string, pinned = false): RankingRow => ({
  itemId, href: `/collections/bags/items/${itemId}`, name, initial: name[0], tier: "Love", pinned,
});
const ROWS = [row("a", "Bag A"), row("b", "Bag B"), row("c", "Bag C", true)];
const names = () => within(screen.getByRole("list")).getAllByRole("link").map((l) => l.textContent);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("RankingList (spec §4 'Adjusting')", () => {
  it("a move pins ONE piece at its new place with one PUT, then refreshes", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Bag B up" }));
    expect(names()).toEqual(["Bag B", "Bag A", "Bag C"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/ranking/pins/b");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ position: 1 });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Moved Bag B to position 1 of 3.")).toBeInTheDocument();
  });

  it("a failed move puts the list back and says so gently, on screen and in a live region", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    // Mounted (empty) before anything fails, so screen readers announce the text when it lands.
    const notice = screen.getAllByRole("status").find((el) => el.closest(".sr-only") === null)!;
    expect(notice).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole("button", { name: "Move Bag A down" }));
    await waitFor(() => expect(names()).toEqual(["Bag A", "Bag B", "Bag C"]));
    expect(notice).toHaveTextContent(/nothing was lost/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Unpin is offered only on a placed piece and sends one DELETE", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    expect(screen.queryByRole("button", { name: "Unpin Bag A" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unpin Bag C" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/coll_1/ranking/pins/c", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("after Unpin and the refresh, keyboard focus lands on that piece's move button", async () => {
    const { rerender } = render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin Bag C" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(<RankingList collectionId="coll_1" rows={[row("a", "Bag A"), row("b", "Bag B"), row("c", "Bag C")]} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Bag C up" }));
  });

  it("keyboard focus stays on the moved piece's button", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Bag A down" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Bag A down" }));
  });

  it("a move that reaches an end keeps focus on the piece's other button", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Bag B up" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Bag B down" }));
  });

  it("the ends cannot move further", () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    expect(screen.getByRole("button", { name: "Move Bag A up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Bag C down" })).toBeDisabled();
  });
});
