// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DeferControl } from "./DeferControl";

beforeEach(() => {
  refresh.mockClear();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("DeferControl", () => {
  it("defers the item (POST deferred) and refreshes", async () => {
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/c1/dispositions",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ itemId: "i1", disposition: "deferred" });
  });

  it("does not confirm — a single quiet tap acts (defer is reversible)", () => {
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    // No confirmation step intervenes: the POST is already in flight after one tap.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("conveys 'I'll come back to this' for assistive tech without shouting it visually", () => {
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    const btn = screen.getByRole("button", { name: /come back to this/i });
    expect(btn).toHaveAttribute("title");
  });

  it("ignores a rapid double-tap — only one POST is sent (in-flight guard)", async () => {
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    const btn = screen.getByRole("button", { name: /not yet/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("busy label is 'Just a moment…', not PR2 set_aside vocabulary", async () => {
    // Hold the fetch unresolved so the in-flight (busy) label is observable.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(screen.getByText("Just a moment…")).toBeInTheDocument());
    expect(screen.queryByText(/setting aside/i)).not.toBeInTheDocument();
  });

  it("a non-ok response shows a gentle role=status message and does NOT refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a network rejection (fetch throws) is caught — gentle message, no refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("local mode: onDecision fires, no fetch, button re-enabled (bypasses AsyncActionButton's never-reset busy)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDecision = vi.fn();
    render(<DeferControl submit={{ kind: "local", onDecision }} itemId="i1" />);
    const btn = screen.getByRole("button", { name: /not yet/i });
    await userEvent.click(btn);
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent("Not yet"); // never "Just a moment…"
  });

  it("local mode renders the same visual button (title + aria-label) as session mode", () => {
    const { unmount } = render(
      <DeferControl submit={{ kind: "session", collectionId: "c1" }} itemId="i1" />,
    );
    const session = screen.getByRole("button", { name: /not yet/i });
    const title = session.getAttribute("title");
    const aria = session.getAttribute("aria-label");
    unmount();
    render(<DeferControl submit={{ kind: "local", onDecision: vi.fn() }} itemId="i1" />);
    const local = screen.getByRole("button", { name: /not yet/i });
    expect(local).toHaveAttribute("title", title);
    expect(local).toHaveAttribute("aria-label", aria);
  });
});
