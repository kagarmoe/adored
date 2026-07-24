// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const replace = vi.fn();
let search = "removed=i1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/collections/rachels-purses/items",
  useSearchParams: () => new URLSearchParams(search),
}));

import { RemovedItemNotice } from "./RemovedItemNotice";

beforeEach(() => {
  vi.clearAllMocks();
  search = "removed=i1";
  global.fetch = vi.fn();
});

describe("RemovedItemNotice", () => {
  it("receives focus on mount — a server-rendered live region is not announced, the focus move is the AT signal", () => {
    render(<RemovedItemNotice itemId="i1" />);
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/removed/i);
  });

  it("'Bring it back' restores the item and strips only the removed param", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<RemovedItemNotice itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /bring it back/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1/restore", { method: "POST" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/collections/rachels-purses/items"),
    );
  });

  it("keeps co-present filters when stripping the removed param", () => {
    search = "status=archived&removed=i1";
    render(<RemovedItemNotice itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(replace).toHaveBeenCalledWith(
      "/collections/rachels-purses/items?status=archived",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a failed restore shows the shared gentle retry line and keeps the notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<RemovedItemNotice itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /bring it back/i }));
    await waitFor(() => expect(screen.getByText(/didn.t go through/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});
