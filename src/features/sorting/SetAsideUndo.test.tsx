// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { TriageUndoProvider } from "./TriageUndoProvider";
import { TriageUndoNotice } from "./TriageUndoNotice";
import { SetAsideButton } from "./SetAsideButton";

// The set-aside undo is split across three pieces so the undo NOTICE can render
// outside the triage page's empty-state branch (and so survive the queue
// emptying): a context PROVIDER holds the state + fetch, a BUTTON inside the
// decision sub-row triggers set-aside, and a NOTICE outside the branch shows the
// persistent "Bring back". These tests exercise that composition.

// Mirrors the triage page: provider wraps both the notice (always rendered, like
// the page's out-of-ternary slot) and the button (rendered only while an item is
// focused, like the page's `{!item ? … : <SetAsideButton/>}`). `item` toggles
// the button to simulate the queue emptying.
function Harness({
  collectionId = "c1",
  itemId = "i1",
  itemName = "A bag" as string | null,
  item = true,
}: {
  collectionId?: string;
  itemId?: string;
  itemName?: string | null;
  item?: boolean;
}) {
  return (
    <TriageUndoProvider collectionId={collectionId}>
      <TriageUndoNotice />
      {item && <SetAsideButton itemId={itemId} itemName={itemName} />}
    </TriageUndoProvider>
  );
}

describe("set-aside undo (provider + button + notice)", () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("set-aside POSTs the right body and the notice appears", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    // No notice before any set-aside.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const post = (global.fetch as any).mock.calls[0];
    expect(post[0]).toBe("/api/collections/c1/dispositions");
    expect(post[1].method).toBe("POST");
    expect(JSON.parse(post[1].body)).toEqual({ itemId: "i1", disposition: "set_aside" });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/set aside/i);
    expect(notice).toHaveTextContent(/a bag/i);
    expect(notice).toHaveTextContent(/bring back/i);
  });

  it("the notice persists when the item becomes null (queue empties)", async () => {
    // Set aside the last item while a button is present…
    const { rerender } = render(<Harness item itemId="i1" itemName="Last bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/last bag/i));

    // …then the queue empties: item === null, so the button unmounts. Because the
    // notice and its state live in the provider ABOVE the item branch, the
    // "Bring back" affordance is still here. This is the bug fix: previously the
    // undo lived inside the branch and vanished exactly when it mattered most.
    rerender(<Harness item={false} />);
    expect(screen.queryByRole("button", { name: /not mine/i })).not.toBeInTheDocument();
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/last bag/i);
    expect(screen.getByRole("button", { name: /bring back/i })).toBeInTheDocument();
  });

  it("bring-back DELETEs the set-aside item and clears the notice", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() =>
      expect(global.fetch as any).toHaveBeenCalledWith(
        "/api/collections/c1/dispositions/i1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a second set-aside replaces the undo target", async () => {
    const { rerender } = render(<Harness itemId="i1" itemName="First" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/first/i));

    // The next item arrives via props (un-keyed button keeps its place); set it
    // aside too — the undo now points at the second item.
    rerender(<Harness itemId="i2" itemName="Second" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/second/i));

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
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/another try/i));
    expect(refresh).not.toHaveBeenCalled();
    // No bring-back offered when nothing was set aside.
    expect(screen.queryByRole("button", { name: /bring back/i })).not.toBeInTheDocument();
  });

  it("a double-tap before the first POST resolves sends a single request", async () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Harness itemId="i1" itemName="A bag" />);
    const btn = screen.getByRole("button", { name: /not mine/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls).toHaveLength(1);
  });

  it("renders a decorative middot that is hidden from screen readers", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    const notice = await screen.findByRole("status");
    const sep = notice.querySelector('[aria-hidden="true"]');
    expect(sep).not.toBeNull();
    expect(sep).toHaveTextContent("·");
  });
});
