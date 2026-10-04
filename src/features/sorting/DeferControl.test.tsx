// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { DeferControl } from "./DeferControl";

describe("DeferControl", () => {
  it("a tap calls onDecision once", async () => {
    const onDecision = vi.fn();
    render(<DeferControl onDecision={onDecision} />);
    await userEvent.click(screen.getByRole("button", { name: /not yet/i }));
    expect(onDecision).toHaveBeenCalledTimes(1);
  });

  it("conveys 'Keeps it for later' for hover and assistive tech without shouting it visually", () => {
    render(<DeferControl onDecision={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /keeps it for later/i });
    expect(btn).toHaveAttribute("title", "Keeps it for later");
  });
});
