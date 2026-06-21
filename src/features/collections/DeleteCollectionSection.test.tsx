// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { DeleteCollectionSection } from "./DeleteCollectionSection";

const props = { collectionId: "col_1", collectionName: "Rachel’s collection" };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("DeleteCollectionSection", () => {
  it("a single tap only reveals the confirm — no API call", () => {
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("keeps the Delete button disabled until the exact name is typed", () => {
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    const confirmBtn = screen.getByRole("button", { name: /^delete collection$/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wrong" } });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: props.collectionName } });
    expect(confirmBtn).toBeEnabled();
  });

  it("purges with the typed name and redirects to /collections on success", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: props.collectionName } });
    fireEvent.click(screen.getByRole("button", { name: /^delete collection$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/collections/col_1/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: props.collectionName }),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections"));
  });

  it("ignores a rapid double-submit — one purge call", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: props.collectionName } });
    const confirmBtn = screen.getByRole("button", { name: /^delete collection$/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("Cancel backs out — no API call, confirm dismissed", () => {
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("a failed purge shows a gentle message and does NOT redirect", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<DeleteCollectionSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this collection/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: props.collectionName } });
    fireEvent.click(screen.getByRole("button", { name: /^delete collection$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
