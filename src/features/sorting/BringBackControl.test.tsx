// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { BringBackControl } from "./BringBackControl";

describe("BringBackControl", () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("DELETEs the disposition for the item and refreshes the route", async () => {
    render(<BringBackControl collectionId="c1" itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toBe("/api/collections/c1/dispositions/i1");
    expect(call[1].method).toBe("DELETE");
  });

  it("shows a gentle error and does not refresh when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    render(<BringBackControl collectionId="c1" itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/another try/i));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a double-tap before the request resolves sends a single DELETE", async () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<BringBackControl collectionId="c1" itemId="i1" />);
    const btn = screen.getByRole("button", { name: /bring back/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls).toHaveLength(1);
  });
});
