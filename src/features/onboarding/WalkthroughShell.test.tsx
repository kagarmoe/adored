// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { WalkthroughShell } from "./WalkthroughShell";
import { TRIAGE_ITEMS, COMPARE_PAIR } from "./sampleData";

afterEach(() => push.mockClear());

describe("WalkthroughShell", () => {
  it("advances Purpose -> Triage -> Compare -> Standing -> Handoff by tapping", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);

    // Purpose
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // Triage — one item at a time; tap a tier for each triage item.
    for (let i = 0; i < TRIAGE_ITEMS.length; i++) {
      expect(
        screen.getByRole("heading", { name: "How do you feel about this one?" })
      ).toBeInTheDocument();
      await user.click(screen.getByText("Love"));
    }

    // Compare
    expect(screen.getByRole("heading", { name: "Which do you reach for more?" })).toBeInTheDocument();
    await user.click(screen.getByText(COMPARE_PAIR[0].name));

    // Standing
    expect(screen.getByRole("heading", { name: "What you love most" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Handoff
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
  });

  it("routes to /collections when 'Skip for now' is tapped", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(push).toHaveBeenCalledWith("/collections");
  });

  it("keeps 'Skip for now' on every beat before the hand-off", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
  });
});
