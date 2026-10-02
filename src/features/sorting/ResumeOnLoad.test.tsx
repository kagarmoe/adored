// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { ResumeOnLoad } from "./ResumeOnLoad";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResumeOnLoad (a paused sort opened by URL becomes active again)", () => {
  it("PATCHes the session active once on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<ResumeOnLoad curatorId="u1" sessionId="sess_1" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "active" });
  });

  it("a failed resume stays quiet (answers still land on a paused sort)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("offline")) as unknown as typeof fetch;
    const { container } = render(<ResumeOnLoad curatorId="u1" sessionId="sess_1" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
