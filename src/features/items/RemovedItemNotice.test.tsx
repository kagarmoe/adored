// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

import { RemovedItemNotice } from "./RemovedItemNotice";

const props = { itemId: "i1", itemsHref: "/collections/rachels-purses/items" };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("RemovedItemNotice", () => {
  it("announces the removal via role=status and offers the way back", () => {
    render(<RemovedItemNotice {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(/removed/i);
    expect(screen.getByRole("button", { name: /bring it back/i })).toBeInTheDocument();
  });

  it("'Bring it back' restores the item, strips the param and refreshes", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<RemovedItemNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /bring it back/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/items/i1/restore", { method: "POST" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/collections/rachels-purses/items"),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("a failed restore shows a gentle retry line and keeps the notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<RemovedItemNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /bring it back/i }));
    await waitFor(() => expect(screen.getByText(/didn’t go through/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("'Done' dismisses by stripping the param", () => {
    render(<RemovedItemNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(replace).toHaveBeenCalledWith("/collections/rachels-purses/items");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
