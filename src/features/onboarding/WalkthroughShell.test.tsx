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
import { DISMISS_KEY, dismissWelcome, isWelcomeDismissed } from "./dismissal";

afterEach(() => {
  push.mockClear();
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

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

  it("dismisses the walkthrough when 'Skip for now' is tapped", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(isWelcomeDismissed()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("dismisses the walkthrough on hand-off completion (explore on my own)", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    for (let i = 0; i < TRIAGE_ITEMS.length; i++) {
      await user.click(screen.getByText("Love"));
    }
    await user.click(screen.getByText(COMPARE_PAIR[0].name));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Reaching the hand-off means the walkthrough was completed.
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
    await user.click(screen.getByText(/I.?ll explore on my own\./));
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("re-open (manual visit) does not clear an existing dismissal cookie", async () => {
    dismissWelcome();
    expect(isWelcomeDismissed()).toBe(true);
    render(<WalkthroughShell />);
    // Mounting the shell (e.g. /profile -> /welcome) must not touch the cookie.
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("keeps 'Skip for now' on every beat before the hand-off", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
  });
});
