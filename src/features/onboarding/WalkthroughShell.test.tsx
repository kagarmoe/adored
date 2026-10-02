// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { WalkthroughShell } from "./WalkthroughShell";
import { TRIAGE_ITEMS } from "./sampleData";
import { DISMISS_KEY, isWelcomeDismissed } from "./dismissal";

// The exit is a full-document navigation (purses-etv0); jsdom can't navigate, so spy on assign.
const assign = vi.fn();
beforeEach(() => {
  assign.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { assign, href: "http://localhost/welcome" } });
});
afterEach(() => {
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

type User = ReturnType<typeof userEvent.setup>;
async function feel(user: User, answers: (string | RegExp)[]) {
  for (const answer of answers) {
    expect(screen.getByRole("heading", { name: "How do you feel about this one?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: answer }));
  }
}
async function pairs(user: User) {
  for (let i = 0; i < 10 && screen.queryByRole("heading", { name: "Which would you reach for first?" }); i++) {
    await user.click(screen.getAllByRole("button", { name: /^Choose / })[0]);
  }
}

describe("WalkthroughShell — the two phases (spec §4 onboarding)", () => {
  it("purpose → feelings → pairs → ranking → hand-off, and finishing dismisses the intro", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", "Like", "Love"]);
    expect(screen.getByRole("heading", { name: "Which would you reach for first?" })).toBeInTheDocument();
    await pairs(user);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
    expect(isWelcomeDismissed()).toBe(true);
    expect(screen.queryByRole("heading", { name: "Do you use this?" })).not.toBeInTheDocument();
  });

  it("pairs only Love and Like: with one loved piece it goes straight to the ranking", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", "Maybe", "Onward"]);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
  });

  it("Not yet and Not mine stay out of the pairs and show in their own rows", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", /^not yet/i, /^not mine/i]);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
    expect(screen.getByText("Still deciding")).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[1].name)).toBeInTheDocument();
  });

  it("moves focus to the beat wrapper on every advance", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(document.activeElement).toBe(document.querySelector("[tabindex='-1']"));
  });

  it("Leave tutorial dismisses and leaves with a full navigation", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Leave tutorial" }));
    expect(isWelcomeDismissed()).toBe(true);
    expect(assign).toHaveBeenCalledWith("/collections");
  });
});
