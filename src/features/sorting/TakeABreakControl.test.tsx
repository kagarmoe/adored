// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// The pause pre-flush rides the shared engine — mock it idle so the existing
// PATCH/navigate assertions are untouched by queue state.
vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { TakeABreakControl } from "./TakeABreakControl";
import { triggerFlush } from "./decisionFlusher";
import { PAUSE_PREFLUSH_BOUND_MS } from "./sessionStatusPatch";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(triggerFlush).mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("TakeABreakControl", () => {
  it("PATCHes {status:'paused'} to the session, then pushes to the calm landing", async () => {
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/sess_01ABC",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ status: "paused" });
  });

  it("speaks from the person's side for assistive tech ('I need a moment')", () => {
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    const btn = screen.getByRole("button", { name: /i need a moment/i });
    expect(btn).toHaveAttribute("title");
  });

  it("ignores a rapid double-tap — only one PATCH is sent (in-flight guard)", async () => {
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    const btn = screen.getByRole("button", { name: /take a break/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("a non-ok response shows a gentle role=status message and does NOT navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("a network rejection (fetch throws) is caught — gentle message, no navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("pre-flushes the decision queue before pausing (Epic P Task 16)", async () => {
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(vi.mocked(triggerFlush)).toHaveBeenCalledWith({ curatorId: "u1", sessionId: "sess_01ABC" });
    expect(vi.mocked(triggerFlush).mock.invocationCallOrder[0]).toBeLessThan(
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
  });

  it("F8: a failing/backing-off pre-flush still PATCHes {status:'paused'} and navigates after the bound", async () => {
    vi.useFakeTimers();
    vi.mocked(triggerFlush).mockReturnValue(new Promise(() => {})); // backing off forever
    render(<TakeABreakControl curatorId="u1" sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(global.fetch).not.toHaveBeenCalled(); // waiting out the (bounded) pre-flush

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAUSE_PREFLUSH_BOUND_MS);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/sess_01ABC",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ status: "paused" }); // stepping away is never gated on the network
    expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort");
  });
});
