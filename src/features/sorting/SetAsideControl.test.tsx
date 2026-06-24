// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { SetAsideControl } from "./SetAsideControl";

describe("SetAsideControl", () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("sets aside then offers a persistent bring-back", async () => {
    const { rerender } = render(<SetAsideControl collectionId="c1" itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const post = (global.fetch as any).mock.calls[0];
    expect(post[0]).toBe("/api/collections/c1/dispositions");
    expect(post[1].method).toBe("POST");
    expect(JSON.parse(post[1].body)).toEqual({ itemId: "i1", disposition: "set_aside" });
    // undo notice present and survives the next item arriving via props
    rerender(<SetAsideControl collectionId="c1" itemId="i2" itemName="Another bag" />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/bring back/i);
    // the notice names the item that was set aside, not the new one
    expect(notice).toHaveTextContent(/a bag/i);
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() =>
      expect(global.fetch as any).toHaveBeenCalledWith(
        "/api/collections/c1/dispositions/i1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("clears the notice and refreshes after bring-back", async () => {
    render(<SetAsideControl collectionId="c1" itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces the undo when a second item is set aside", async () => {
    const { rerender } = render(<SetAsideControl collectionId="c1" itemId="i1" itemName="First" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/first/i));
    rerender(<SetAsideControl collectionId="c1" itemId="i2" itemName="Second" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/second/i));
    // the bring-back now targets the second item
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() =>
      expect(global.fetch as any).toHaveBeenCalledWith(
        "/api/collections/c1/dispositions/i2",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("shows a gentle error and does not refresh when the set-aside fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    render(<SetAsideControl collectionId="c1" itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/another try/i));
    expect(refresh).not.toHaveBeenCalled();
    // no bring-back offered when nothing was set aside
    expect(screen.queryByRole("button", { name: /bring back/i })).not.toBeInTheDocument();
  });

  it("a double-tap before the first POST resolves sends a single request", async () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<SetAsideControl collectionId="c1" itemId="i1" itemName="A bag" />);
    const btn = screen.getByRole("button", { name: /not mine/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls).toHaveLength(1);
  });
});
