// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { WalkthroughShell } from "./WalkthroughShell";
import { TRIAGE_ITEMS, COMPARE_PAIR } from "./sampleData";
import { DISMISS_KEY, dismissWelcome, isWelcomeDismissed } from "./dismissal";

afterEach(() => {
  push.mockClear();
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

// The wrapper that beat content lives in — the aria-live region and focus target.
function liveRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>("[aria-live='polite']");
  if (!region) throw new Error("no aria-live region found");
  return region;
}

async function tapTiers(user: ReturnType<typeof userEvent.setup>, label = "Love") {
  for (let i = 0; i < TRIAGE_ITEMS.length; i++) {
    expect(
      screen.getByRole("heading", { name: "How do you feel about this one?" })
    ).toBeInTheDocument();
    await user.click(screen.getByText(label));
  }
}

describe("WalkthroughShell", () => {
  it("full happy path: purpose -> 3 triage taps -> compare -> standing -> refine -> handoff", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);

    // Purpose
    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // Triage — one item at a time.
    await tapTiers(user);

    // Compare
    expect(screen.getByRole("heading", { name: "Which do you love more?" })).toBeInTheDocument();
    await user.click(screen.getByText(COMPARE_PAIR[0].name));

    // Standing — beat title is "Where things stand"; the hero eyebrow keeps the
    // "What you love most" affirmation inside the beat.
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Refine (new beat)
    expect(screen.getByRole("heading", { name: "Refine it any time" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Handoff
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
  });

  it("tie path reaches a standing with both pair items ranked", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);
    await user.click(screen.getByRole("button", { name: "Tie" }));
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText(COMPARE_PAIR[0].name)).toBeInTheDocument();
    expect(screen.getByText(COMPARE_PAIR[1].name)).toBeInTheDocument();
  });

  it("skip path reaches a standing with both pair items ranked", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText(COMPARE_PAIR[0].name)).toBeInTheDocument();
    expect(screen.getByText(COMPARE_PAIR[1].name)).toBeInTheDocument();
  });

  it("defer path: a deferred item does NOT resurface — 3 choices always reach compare", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // Item 1: "Not yet" (defer) — must advance, never re-queue.
    expect(
      screen.getByRole("heading", { name: "How do you feel about this one?" })
    ).toBeInTheDocument();
    await user.click(screen.getByText("Not yet"));

    // Items 2 and 3: tiers.
    await user.click(screen.getByText("Love"));
    await user.click(screen.getByText("Like"));

    // Exactly three choices land on compare — no fourth triage item.
    expect(screen.getByRole("heading", { name: "Which do you love more?" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "How do you feel about this one?" })
    ).not.toBeInTheDocument();
  });

  it("set-aside path shows the set-aside group in standing", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    await user.click(screen.getByText("Love")); // item 1 (vase)
    await user.click(screen.getByText("Love")); // item 2 (books)
    await user.click(screen.getByText("Not mine")); // item 3 (cushion) — set aside

    await user.click(screen.getByText(COMPARE_PAIR[0].name));

    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    // The last triage item is the kid's microphone cushion.
    expect(screen.getByText(TRIAGE_ITEMS[2].name)).toBeInTheDocument();
  });

  it("all-escapes path: every triage item stepped out, compare skipped, still lands calmly", async () => {
    // The compare pair is always ranked, so the standing shows the pair plus the
    // stepped-out groups — no crash, both escape groups render.
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    await user.click(screen.getByText("Not yet")); // item 1 deferred
    await user.click(screen.getByText("Not mine")); // item 2 set aside
    await user.click(screen.getByText("Not yet")); // item 3 deferred

    await user.click(screen.getByRole("button", { name: "Skip" })); // compare skip

    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    // The pair is still ranked, so the affirmation still anchors the loved top.
    expect(screen.getByText(COMPARE_PAIR[0].name)).toBeInTheDocument();
  });

  it("focus moves to the new beat's live region on advance", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // A tier tap advances the triage index; focus lands on the beat's wrapper so
    // a screen reader re-announces the region rather than staying on the tapped
    // control.
    await user.click(screen.getByText("Love"));
    expect(document.activeElement).toBe(liveRegion());
  });

  it("wraps beat content in an aria-live=polite region", () => {
    render(<WalkthroughShell />);
    expect(
      screen.getByText(/rediscover what you love/i).closest("[aria-live='polite']")
    ).not.toBeNull();
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

  it.each([
    ["purpose", async (user: ReturnType<typeof userEvent.setup>) => {}],
    [
      "triage",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
      },
    ],
    [
      "compare",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
      },
    ],
    [
      "standing",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        await user.click(screen.getByText(COMPARE_PAIR[0].name));
      },
    ],
    [
      "refine",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        await user.click(screen.getByText(COMPARE_PAIR[0].name));
        await user.click(screen.getByRole("button", { name: "Continue" }));
      },
    ],
  ])(
    "'Skip for now' on the %s beat dismisses and routes to /collections",
    async (_beat, advance) => {
      const user = userEvent.setup();
      render(<WalkthroughShell />);
      await advance(user);
      expect(isWelcomeDismissed()).toBe(false);
      await user.click(screen.getByRole("button", { name: "Skip for now" }));
      expect(push).toHaveBeenCalledWith("/collections");
      expect(isWelcomeDismissed()).toBe(true);
    }
  );

  it("dismisses the walkthrough on hand-off completion (explore on my own)", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);
    await user.click(screen.getByText(COMPARE_PAIR[0].name));
    await user.click(screen.getByRole("button", { name: "Continue" })); // standing -> refine
    await user.click(screen.getByRole("button", { name: "Continue" })); // refine -> handoff
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

  it("keeps 'Skip for now' on every beat before the hand-off but not on it", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    await tapTiers(user);
    await user.click(screen.getByText(COMPARE_PAIR[0].name));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Handoff has its own explore affordance — no "Skip for now".
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
  });
});
