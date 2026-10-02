// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const replace = vi.fn();
let search = "removed=i1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/collections/rachels-purses/items",
  useSearchParams: () => new URLSearchParams(search),
}));

import { ArchivedNotice } from "./ArchivedNotice";

beforeEach(() => {
  vi.clearAllMocks();
  search = "removed=i1";
  global.fetch = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

describe("ArchivedNotice", () => {
  it("receives focus on mount — a server-rendered live region is not announced, the focus move is the AT signal", () => {
    render(<ArchivedNotice kind="item" id="i1" />);
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/archived/i);
  });

  it("'Undo' restores the item and strips only the removed param", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ArchivedNotice kind="item" id="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1/restore", { method: "POST" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/collections/rachels-purses/items"),
    );
  });

  it("keeps co-present filters when stripping the removed param", () => {
    search = "status=archived&removed=i1";
    render(<ArchivedNotice kind="item" id="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(replace).toHaveBeenCalledWith(
      "/collections/rachels-purses/items?status=archived",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a failed restore shows the shared gentle retry line and keeps the notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ArchivedNotice kind="item" id="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));
    await waitFor(() => expect(screen.getByText(/didn.t go through/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("builds the restore URL from kind and id, encoded — a hostile id cannot aim Undo elsewhere", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<ArchivedNotice kind="collection" id="../col_9/archive#" />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/collections/..%2Fcol_9%2Farchive%23/restore", { method: "POST" }),
    );
  });
});
