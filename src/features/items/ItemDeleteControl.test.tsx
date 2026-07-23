// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { ItemDeleteControl } from "./ItemDeleteControl";

const props = { itemId: "i1", itemsHref: "/collections/rachels-purses/items" };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("ItemDeleteControl", () => {
  it("a single tap only reveals the confirm — no API call", () => {
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/remove this item from the collection\?/i)).toBeInTheDocument();
  });

  it("moves focus to the safe default (Keep) when the confirm appears", () => {
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    expect(screen.getByRole("button", { name: /^keep$/i })).toHaveFocus();
  });

  it("DELETEs the item and navigates to the items list with the removed param", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1", { method: "DELETE" }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/rachels-purses/items?removed=i1"),
    );
  });

  it("ignores a rapid double-confirm — one DELETE", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    const confirm = screen.getByRole("button", { name: /^remove$/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("Keep backs out — no API call, confirm dismissed", () => {
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^keep$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/remove this item from the collection\?/i),
    ).not.toBeInTheDocument();
  });

  it("a non-ok response shows a gentle message and does not navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ItemDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove from collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/the item is still here/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
