// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhotoDeleteControl } from "./PhotoDeleteControl";

const onDeleted = vi.fn();
const props = { collectionId: "c1", itemId: "i1", photoId: "p1", onDeleted };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("PhotoDeleteControl", () => {
  it("a single tap only reveals the confirm — no API call, nothing deleted", () => {
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this photo\?/i)).toBeInTheDocument();
  });

  it("moves focus to the safe default (Keep) when the confirm appears", () => {
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    expect(screen.getByRole("button", { name: /^keep$/i })).toHaveFocus();
  });

  it("DELETEs the right photo and calls onDeleted on confirm", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/collections/c1/items/i1/photos/p1", {
        method: "DELETE",
      }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("ignores a rapid double-confirm — one DELETE, one onDeleted", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    const confirm = screen.getByRole("button", { name: /^delete$/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("Keep backs out — no API call, confirm dismissed", () => {
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^keep$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/delete this photo\?/i)).not.toBeInTheDocument();
  });

  it("a non-ok response shows a gentle message and does NOT call onDeleted", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("a network rejection is caught — gentle message, no onDeleted", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<PhotoDeleteControl {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
