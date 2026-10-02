// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ItemOverflowMenu, IN_RANKING_LINE } from "./ItemOverflowMenu";

const props = { itemId: "i1", itemsHref: "/collections/bags/items" };
const fetchMock = () => global.fetch as unknown as ReturnType<typeof vi.fn>;
const res = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
}

describe("ItemOverflowMenu", () => {
  it("a curator can archive but sees no Delete; archive lands on the list with the undo notice", async () => {
    fetchMock().mockResolvedValue(res(200));
    render(<ItemOverflowMenu {...props} isOwner={false} />);
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/items/i1", { method: "DELETE" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/items?removed=i1"));
  });

  it("a failed archive stays put with a gentle retry line", async () => {
    fetchMock().mockResolvedValue(res(500));
    render(<ItemOverflowMenu {...props} isOwner={false} />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/didn.t go through/i));
    // In flow under the header (never in the floating panel's container), on its own surface.
    const status = screen.getByRole("status");
    expect(status).toHaveClass("bg-surface-raised");
    expect(status.closest(".absolute")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("owner Delete: one confirm, a 409 offers to clear saved rankings, then Delete again purges", async () => {
    fetchMock()
      .mockResolvedValueOnce(res(409))
      .mockResolvedValueOnce(res(200, { removed: 1, remainingInFinalized: 0 }))
      .mockResolvedValueOnce(res(200));
    render(<ItemOverflowMenu {...props} isOwner />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
    // In flow under the header, never floating over the subtitle (phone overlap bug).
    const confirm = screen.getByRole("group", { name: "Delete this item" });
    expect(confirm).toHaveClass("basis-full");
    expect(confirm.closest(".absolute")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }));

    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/api/items/i1/purge");
    expect(JSON.parse(init.body)).toEqual({ confirm: "PURGE" });
    await waitFor(() =>
      expect(screen.getByText(IN_RANKING_LINE, { exact: false })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Delete for good" })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    expect(screen.getByRole("group", { name: "Delete this item" })).toHaveAccessibleDescription(
      expect.stringContaining(IN_RANKING_LINE),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove from saved rankings" }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/items/i1/remove-from-sorts", {
      method: "POST",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Delete for good" }));
    expect(fetchMock().mock.calls[2][0]).toBe("/api/items/i1/purge");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/items"));
  });

  it("Keep closes the confirm and hands focus back to the ··· trigger", async () => {
    render(<ItemOverflowMenu {...props} isOwner />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group", { name: "Delete this item" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();
  });

  it("a finished ranking still holding it means Delete is not re-offered", async () => {
    fetchMock()
      .mockResolvedValueOnce(res(409))
      .mockResolvedValueOnce(res(200, { removed: 0, remainingInFinalized: 1 }));
    render(<ItemOverflowMenu {...props} isOwner />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove from saved rankings" }),
    );
    await waitFor(() => expect(screen.getByText(/finished ranking/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Delete for good" })).not.toBeInTheDocument();
  });
});
