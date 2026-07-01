// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhatMoved } from "./WhatMoved";
import type { MovedDecision } from "@/lib/what-moved";

const START = 1_000;
const NOW = 5_000;

function triage(result: "top" | "high" | "medium" | "low", at: number): MovedDecision {
  return { type: "triage", createdAt: at, decision: { itemId: `i-${at}`, result } };
}
function compare(at: number): MovedDecision {
  return { type: "pairwise_compare", createdAt: at, decision: { itemAId: "a", itemBId: "b", result: "item_a" } };
}

describe("WhatMoved", () => {
  it("summarizes only the decisions inside the round window, grouped by outcome", () => {
    const decisions: MovedDecision[] = [
      triage("top", START - 1), // BEFORE the window → excluded
      triage("top", START), // edge (inclusive) → counted
      triage("high", 2_000),
      triage("medium", 3_000),
      triage("low", 4_000),
      compare(4_500),
      triage("top", NOW + 1), // AFTER the window → excluded
    ];
    render(<WhatMoved decisions={decisions} windowStartMs={START} nowMs={NOW} hubHref="/hub" />);

    expect(screen.getByRole("heading", { name: /here's what moved/i })).toBeInTheDocument();
    // top: 1 (edge only; the pre-window top is excluded)
    expect(screen.getByText(/1 you love/i)).toBeInTheDocument();
    expect(screen.getByText(/1 you like/i)).toBeInTheDocument();
    expect(screen.getByText(/1 to sit with/i)).toBeInTheDocument();
    expect(screen.getByText(/1 moved onward/i)).toBeInTheDocument();
    expect(screen.getByText(/1 comparison made/i)).toBeInTheDocument();
  });

  it("announces the recap via an aria-live region", () => {
    const { container } = render(
      <WhatMoved decisions={[triage("top", 2_000)]} windowStartMs={START} nowMs={NOW} hubHref="/hub" />,
    );
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("shows a gentle empty state when nothing moved in the window", () => {
    render(<WhatMoved decisions={[]} windowStartMs={START} nowMs={NOW} hubHref="/hub" />);
    expect(screen.getByText(/gentle pass/i)).toBeInTheDocument();
    expect(screen.queryByText(/you love/i)).not.toBeInTheDocument();
  });

  it("links back to the session hub", () => {
    render(<WhatMoved decisions={[]} windowStartMs={START} nowMs={NOW} hubHref="/collections/x/sort/2" />);
    const link = screen.getByRole("link", { name: /back to your sort/i });
    expect(link).toHaveAttribute("href", "/collections/x/sort/2");
  });
});
