// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SessionCompleteScreen } from "./SessionCompleteScreen";

const props = {
  sessionId: "sess_01ULID",
  sessionNumber: 2,
  collectionId: "coll_01ULID",
  collectionSlug: "summer-bags",
  decisionCount: 5,
  bucketCounts: { top: 1, high: 1, medium: 1, low: 1 },
};

beforeEach(() => { vi.clearAllMocks(); });

describe("SessionCompleteScreen", () => {
  it("Continue Sorting goes to slug + session number", () => {
    render(<SessionCompleteScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue Sorting" }));
    expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/2");
  });

  it("Generate Results POSTs ULIDs, then redirects to slug + result number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "res_1", number: 7 }) }));
    render(<SessionCompleteScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Results" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/results/7"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID");
    expect(body.sessionId).toBe("sess_01ULID");
  });
});
