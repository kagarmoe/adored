// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), back: vi.fn() }) }));

import { FinalizeResultForm } from "./FinalizeResultForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("FinalizeResultForm", () => {
  it("finalizes via the result ULID, then redirects to the slug + number", async () => {
    render(<FinalizeResultForm collectionId="summer-bags" resultId="res_01XYZ" resultNumber={3} defaultName="Spring edit" />);
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/results/3"));
    // API used the ULID, never the number.
    const calls = (fetch as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((u: string) => u === "/api/sort-results/res_01XYZ/finalize")).toBe(true);
  });
});
