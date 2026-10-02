// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { InYourLifeChip } from "./InYourLifeChip";
const ok = (body: unknown = {}) => ({ ok: true, json: async () => body });
beforeEach(() => { global.fetch = vi.fn().mockResolvedValue(ok()) as never; });
describe("InYourLifeChip", () => {
  it("starts unset and writes nothing until tapped", () => {
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("tapping writes a usage decision to the curator's open session", async () => {
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    expect(screen.getByRole("button", { name: "Resting" })).toHaveAttribute("aria-pressed", "true");
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/s1/decisions");
    expect(JSON.parse(init.body)).toMatchObject({ type: "usage", decision: { itemId: "i1", result: "not_uses" } });
  });
  it("with no open session, starts one first, then records the decision there", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(ok({ id: "s9" })).mockResolvedValue(ok()) as never;
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "I use this" }));
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("/api/sessions");
    expect(JSON.parse(calls[0][1].body)).toEqual({ collectionId: "c1" });
    await waitFor(() => expect(calls[1][0]).toBe("/api/sessions/s9/decisions"));
  });
  it("when a session opened elsewhere holds the slot (409), re-reads the page and uses that session next", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValue(ok()) as never;
    const { rerender } = render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "I use this" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s7" />);
    await userEvent.click(screen.getByRole("button", { name: "I use this" }));
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe("/api/sessions/s7/decisions"),
    );
  });
  it("when the session has finished elsewhere (409), the next tap starts a fresh one", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce(ok({ id: "s9" }))
      .mockResolvedValue(ok()) as never;
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    await waitFor(() => expect(screen.getByText(/didn.t save/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[1][0]).toBe("/api/sessions");
    await waitFor(() => expect(calls[2][0]).toBe("/api/sessions/s9/decisions"));
  });
  it("a failed write puts the chip back and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
    render(<InYourLifeChip collectionId="c1" itemId="i1" sessionId="s1" initial="uses" />);
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    await waitFor(() => expect(screen.getByText(/didn.t save/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
  });
});
