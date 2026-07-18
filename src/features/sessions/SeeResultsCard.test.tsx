// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SeeResultsCard } from "./SeeResultsCard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeeResultsCard", () => {
  it("labels the trigger 'See results' — the hub's permanent door (spec §C/§D)", () => {
    render(<SeeResultsCard collectionId="coll_1" collectionSlug="summer-bags" />);
    expect(screen.getByRole("button", { name: "See results" })).toBeInTheDocument();
  });

  it("on tap, materializes a draft result and navigates straight to it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ number: 3 }) }),
    );
    render(<SeeResultsCard collectionId="coll_1" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "See results" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/results/3"));
  });

  it("on failure, shows the gentle nothing-was-lost line and re-enables the trigger", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<SeeResultsCard collectionId="coll_1" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "See results" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "That didn't come together just now. Nothing was lost — try again whenever you like.",
      ),
    );
    expect(screen.getByRole("button", { name: "See results" })).not.toBeDisabled();
  });
});
