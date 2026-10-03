// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const replace = vi.fn();
let search = "removed=item_1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/collections/rachels-purses/items",
  useSearchParams: () => new URLSearchParams(search),
}));

import { ArchivedNotice } from "./ArchivedNotice";

beforeEach(() => {
  vi.clearAllMocks();
  search = "removed=item_1";
  global.fetch = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

describe("ArchivedNotice", () => {
  it("renders nothing for an id that is not id-shaped — a hostile ?removed= can never aim Undo elsewhere", () => {
    const { container } = render(<ArchivedNotice kind="collection" id="../x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("receives focus on mount — a server-rendered live region is not announced, the focus move is the AT signal", () => {
    render(<ArchivedNotice kind="item" id="item_1" />);
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/archived/i);
  });

  it("'Undo' restores the item and strips only the removed param", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ArchivedNotice kind="item" id="item_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/item_1/restore", { method: "POST" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/collections/rachels-purses/items"),
    );
  });

  it("after Undo or Done, focus moves to the list heading — never dropped to the page as the notice unmounts", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(
      <main>
        <h1 tabIndex={-1}>Summer bags</h1>
        <ArchivedNotice kind="item" id="item_1" />
      </main>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Summer bags" })).toHaveFocus());
    screen.getByRole("status").focus();
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(screen.getByRole("heading", { name: "Summer bags" })).toHaveFocus();
  });

  it("keeps co-present filters when stripping the removed param", () => {
    search = "status=archived&removed=item_1";
    render(<ArchivedNotice kind="item" id="item_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(replace).toHaveBeenCalledWith(
      "/collections/rachels-purses/items?status=archived",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a failed restore shows the shared gentle retry line and keeps the notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ArchivedNotice kind="item" id="item_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    await waitFor(() => expect(screen.getByText(/didn.t go through/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});
