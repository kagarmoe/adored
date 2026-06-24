// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { TakeABreakControl } from "./TakeABreakControl";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("TakeABreakControl", () => {
  it("PATCHes {status:'paused'} to the session, then pushes to the calm landing", async () => {
    render(<TakeABreakControl sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
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
    render(<TakeABreakControl sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    const btn = screen.getByRole("button", { name: /i need a moment/i });
    expect(btn).toHaveAttribute("title");
  });

  it("ignores a rapid double-tap — only one PATCH is sent (in-flight guard)", async () => {
    render(<TakeABreakControl sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    const btn = screen.getByRole("button", { name: /take a break/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("a non-ok response shows a gentle role=status message and does NOT navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<TakeABreakControl sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("a network rejection (fetch throws) is caught — gentle message, no navigate", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<TakeABreakControl sessionId="sess_01ABC" collectionHref="/collections/summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
