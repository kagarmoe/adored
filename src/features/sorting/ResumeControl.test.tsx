// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// Resuming never flushes — mock the engine to PROVE the negative below.
vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { ResumeControl } from "./ResumeControl";
import { drain, triggerFlush } from "./decisionFlusher";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("ResumeControl", () => {
  it("PATCHes {status:'active'} to the session, then pushes to the sort screen", async () => {
    render(<ResumeControl curatorId="u1" sessionId="sess_01ABC" sortHref="/collections/summer-bags/sort/4" />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/4"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/sess_01ABC",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ status: "active" });
  });

  it("ignores a rapid double-tap — only one PATCH is sent (in-flight guard)", async () => {
    render(<ResumeControl curatorId="u1" sessionId="sess_01ABC" sortHref="/collections/summer-bags/sort/4" />);
    const btn = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("a non-ok response shows a gentle role=status message and does NOT navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ResumeControl curatorId="u1" sessionId="sess_01ABC" sortHref="/collections/summer-bags/sort/4" />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("a network rejection (fetch throws) is caught — gentle message, no navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<ResumeControl curatorId="u1" sessionId="sess_01ABC" sortHref="/collections/summer-bags/sort/4" />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("resume never drains or triggers a flush (Epic P Task 16 — no pre-flush on 'active')", async () => {
    render(<ResumeControl curatorId="u1" sessionId="sess_01ABC" sortHref="/collections/summer-bags/sort/4" />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(vi.mocked(drain)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerFlush)).not.toHaveBeenCalled();
  });
});
