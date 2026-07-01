// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoundShell } from "./RoundShell";

describe("RoundShell", () => {
  it("renders the round label and its children", () => {
    render(
      <RoundShell step={1} totalSteps={3} roundLabel="First pass">
        <p>the round content</p>
      </RoundShell>,
    );
    expect(screen.getByText("First pass")).toBeInTheDocument();
    expect(screen.getByText("the round content")).toBeInTheDocument();
  });

  it("renders a step indicator with N steps and marks completed steps with a non-colour ✓ distinction", () => {
    render(
      <RoundShell step={3} totalSteps={3} roundLabel="Round">
        <div />
      </RoundShell>,
    );
    const indicator = screen.getByRole("list", { name: /progress/i });
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    // Steps 1 and 2 are completed (before the current step 3): a checkmark, not colour alone.
    expect(indicator).toHaveTextContent("✓");
    // The current step is announced for assistive tech.
    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
  });

  it("renders the timer slot when provided", () => {
    render(
      <RoundShell step={1} totalSteps={3} roundLabel="Round" timer={<div>TIMER SLOT</div>}>
        <div />
      </RoundShell>,
    );
    expect(screen.getByText("TIMER SLOT")).toBeInTheDocument();
  });

  it("shows a Pause action (≥44px tap target) that calls onPause", async () => {
    const onPause = vi.fn();
    const user = userEvent.setup();
    render(
      <RoundShell step={1} totalSteps={3} roundLabel="Round" onPause={onPause}>
        <div />
      </RoundShell>,
    );
    const pause = screen.getByRole("button", { name: /pause/i });
    expect(pause.className).toMatch(/h-11|min-h-11/);
    await user.click(pause);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("omits the Pause action when no onPause handler is given", () => {
    render(
      <RoundShell step={1} totalSteps={3} roundLabel="Round">
        <div />
      </RoundShell>,
    );
    expect(screen.queryByRole("button", { name: /pause/i })).toBeNull();
  });
});
