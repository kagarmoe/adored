// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { StartSessionForm } from "./StartSessionForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "sess_01ABC", number: 4 }) }));
});

describe("StartSessionForm", () => {
  it("POSTs the collection ULID, then redirects DIRECTLY to triage (slug + session number)", async () => {
    render(<StartSessionForm collectionId="coll_01ULID" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Session" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/4/triage"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID"); // API body uses the ULID, not the slug
  });
});
