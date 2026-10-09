// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecisionControls } from "./DecisionControls";

// The triage tiers exactly as the triage page wires them (Love→top … Onward→low).
const TRIAGE_DECISIONS = [
  { label: "Love", decision: { itemId: "item_1", result: "top" } },
  { label: "Like", decision: { itemId: "item_1", result: "high" } },
  { label: "Maybe", decision: { itemId: "item_1", result: "medium" } },
  { label: "Onward", decision: { itemId: "item_1", result: "low" } },
];

describe("DecisionControls triage tier tap", () => {
  it("renders one button per tier with its human label", () => {
    render(
      <DecisionControls onDecision={vi.fn()} decisions={TRIAGE_DECISIONS} />,
    );
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("lays triage tiers out as a deliberate 2x2 phone grid", () => {
    render(
      <DecisionControls onDecision={vi.fn()} decisions={TRIAGE_DECISIONS} />,
    );
    const tierGroup = screen.getByRole("button", { name: "Love" }).parentElement;
    expect(tierGroup).toHaveClass("grid", "grid-cols-2", "sm:flex");
  });

  it("announces the saved tier in a live region that already exists before the tap, and re-announces a repeated tier (SC 4.1.3)", async () => {
    const user = userEvent.setup();
    render(
      <DecisionControls onDecision={vi.fn()} decisions={TRIAGE_DECISIONS} />,
    );

    // The region must be in the DOM BEFORE its text changes, or screen readers
    // never announce it.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Love — saved."));
    const first = screen.getByRole("status").textContent;

    // Triage runs Love, Love, Love — identical text would not re-fire the live
    // region, so the second save must still mutate it.
    await user.click(screen.getByRole("button", { name: "Love" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe(first));
    expect(screen.getByRole("status")).toHaveTextContent("Love — saved.");
  });
});

describe("prior answer (F19)", () => {
  it("marks the standing tier as currently selected (aria-pressed) and leaves the others untouched", () => {
    render(
      <DecisionControls
        onDecision={vi.fn()}
        decisions={TRIAGE_DECISIONS}
        priorAnswer="Like"
      />,
    );
    expect(screen.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Love", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-pressed");
    }
  });

  it("without the prop, no tier is pressed — today's fresh rendering (regression)", () => {
    render(
      <DecisionControls onDecision={vi.fn()} decisions={TRIAGE_DECISIONS} />,
    );
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-pressed");
    }
  });

  it("the standing tier stays tappable — a different tap still submits (change-your-mind path)", async () => {
    const onDecision = vi.fn();
    render(
      <DecisionControls
        onDecision={onDecision}
        decisions={TRIAGE_DECISIONS}
        priorAnswer="Love"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onDecision).toHaveBeenCalledWith({ itemId: "item_1", result: "medium" });
  });
});

describe("answering", () => {
  it("calls onDecision with the tier's decision and stays enabled (no pending state)", async () => {
    const onDecision = vi.fn();
    render(
      <DecisionControls
        onDecision={onDecision}
        decisions={[{ label: "Love", decision: { itemId: "i1", result: "top" } }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onDecision).toHaveBeenCalledWith({ itemId: "i1", result: "top" });
    expect(screen.getByRole("button", { name: "Love" })).toBeEnabled();
  });

  it("an answer that did not hold (onDecision → false) is not announced as saved", async () => {
    render(<DecisionControls onDecision={() => false} decisions={TRIAGE_DECISIONS} />);
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
