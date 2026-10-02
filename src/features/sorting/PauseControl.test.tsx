// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { PauseControl } from "./PauseControl";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

describe("PauseControl (spec §4.2: Pause returns home, session paused)", () => {
  it("PATCHes {status:'paused'}, then goes home", async () => {
    render(<PauseControl curatorId="u1" sessionId="sess_1" collectionHref="/collections/bags" />);
    fireEvent.click(screen.getByRole("button", { name: /^pause/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags"));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1");
    expect(JSON.parse(init.body)).toEqual({ status: "paused" });
  });

  it("a double tap sends one PATCH", async () => {
    render(<PauseControl curatorId="u1" sessionId="sess_1" collectionHref="/collections/bags" />);
    const button = screen.getByRole("button", { name: /^pause/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});
