// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { WalkthroughShell } from "./WalkthroughShell";
import { TRIAGE_ITEMS, USAGE_ITEMS } from "./sampleData";
import { DISMISS_KEY, dismissWelcome, isWelcomeDismissed } from "./dismissal";

// The exit leaves the onboarding SPA via a full-document navigation
// (window.location.assign) so the server re-runs the /welcome gate with the
// fresh dismissal cookie — router.push replayed a poisoned App Router cache
// entry and bounced back to /welcome (purses-etv0). jsdom doesn't implement
// navigation, so we spy on assign.
const assign = vi.fn();
beforeEach(() => {
  assign.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, href: "http://localhost/welcome" },
  });
});

afterEach(() => {
  push.mockClear();
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

// The wrapper that beat content lives in — the focus target we move focus to on
// each advance so a screen reader re-announces the new beat (its own h1).
function beatWrapper(): HTMLElement {
  const wrapper = document.querySelector<HTMLElement>("[tabindex='-1']");
  if (!wrapper) throw new Error("no beat wrapper found");
  return wrapper;
}

async function tapTiers(user: ReturnType<typeof userEvent.setup>, label = "Love") {
  for (let i = 0; i < TRIAGE_ITEMS.length; i++) {
    expect(
      screen.getByRole("heading", { name: "How do you feel about this one?" })
    ).toBeInTheDocument();
    await user.click(screen.getByText(label));
  }
  expect(screen.getByRole("heading", { name: "After Triage" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

async function passUsage(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < USAGE_ITEMS.length; i++) {
    expect(screen.getByRole("heading", { name: "Do you use this?" })).toBeInTheDocument();
    expect(screen.getByText(USAGE_ITEMS[i].name)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, I use it" }));
  }
  expect(screen.getByRole("heading", { name: "After Usage" })).toBeInTheDocument();
  expect(screen.getByText("The Triage order stays. Usage adds a note to each piece.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

async function passCompare(
  user: ReturnType<typeof userEvent.setup>,
  outcome: "first" | "second" | "tie" | "skip" = "first",
) {
  for (let i = 0; i < 10 && screen.queryByRole("heading", { name: "Which do you love more?" }); i++) {
    if (outcome === "tie") {
      await user.click(screen.getByRole("button", { name: "Tie" }));
    } else if (outcome === "skip") {
      await user.click(screen.getByRole("button", { name: "Skip" }));
    } else {
      const choices = screen.getAllByRole("button", { name: /^Choose / });
      await user.click(choices[outcome === "second" ? 1 : 0]);
    }
  }
}

describe("WalkthroughShell", () => {
  it("full happy path: purpose -> triage -> triage standing -> usage -> usage standing -> compare -> standing -> refine -> handoff", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);

    // Purpose
    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // Triage — one item at a time.
    await tapTiers(user);

    // Usage — same sample collection, one item at a time, then its standing.
    await passUsage(user);

    // Compare — several pairs, then the cumulative standing.
    expect(screen.getByRole("heading", { name: "Which do you love more?" })).toBeInTheDocument();
    expect(screen.queryByText(/Pair 1 of/i)).not.toBeInTheDocument();
    await passCompare(user, "second");

    // Standing — beat title is "Where things stand"; the hero eyebrow keeps the
    // "What you love most" affirmation inside the beat.
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Compare folds those pair choices into the same standing. Triage groups and Usage notes stay with each piece."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[2].name)).toBeInTheDocument();
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
    await passUsage(user);
    await passCompare(user, "tie");
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[0].name)).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[1].name)).toBeInTheDocument();
  });

  it("skip path reaches a standing with both pair items ranked", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);
    await passUsage(user);
    await passCompare(user, "skip");
    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[0].name)).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[1].name)).toBeInTheDocument();
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

    // Exactly three choices land on the triage standing — no fourth triage item.
    expect(
      screen.queryByRole("heading", { name: "How do you feel about this one?" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "After Triage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await passUsage(user);

    // ...and then compare.
    expect(screen.getByRole("heading", { name: "Which do you love more?" })).toBeInTheDocument();
  });

  it("set-aside path shows the set-aside group in standing", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    await user.click(screen.getByText("Love")); // item 1
    await user.click(screen.getByText("Love")); // item 2
    await user.click(screen.getByText("Not mine")); // item 3 — set aside
    expect(screen.getByRole("heading", { name: "After Triage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await passUsage(user); // usage beat -> compare
    await passCompare(user);

    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    // The last triage item is the kid's microphone cushion.
    expect(screen.getByText(TRIAGE_ITEMS[2].name)).toBeInTheDocument();
  });

  it("all-escapes path: every triage item stepped out, compare skipped, still lands calmly", async () => {
    // When every triage item steps out, Compare has no ranked pairs. The standing
    // still lands calmly and shows both escape groups.
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    await user.click(screen.getByText("Not yet")); // item 1 deferred
    await user.click(screen.getByText("Not mine")); // item 2 set aside
    await user.click(screen.getByText("Not yet")); // item 3 deferred
    expect(screen.getByRole("heading", { name: "After Triage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await passUsage(user); // usage beat -> standing when no ranked items remain

    expect(screen.getByRole("heading", { name: "Where things stand" })).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    expect(screen.queryByText("What you love most")).not.toBeInTheDocument();
  });

  it("focus moves to the new beat's wrapper on advance", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));

    // A tier tap advances the triage index; focus lands on the beat's wrapper so
    // a screen reader re-announces the region rather than staying on the tapped
    // control.
    await user.click(screen.getByText("Love"));
    expect(document.activeElement).toBe(beatWrapper());
  });

  it("focus also moves when usage items and compare pairs advance within the same beat", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);

    await user.click(screen.getByRole("button", { name: "Yes, I use it" }));
    expect(document.activeElement).toBe(beatWrapper());

    await user.click(screen.getByRole("button", { name: "Yes, I use it" }));
    await user.click(screen.getByRole("button", { name: "Yes, I use it" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const choices = screen.getAllByRole("button", { name: /^Choose / });
    await user.click(choices[0]);
    expect(document.activeElement).toBe(beatWrapper());
  });

  it("exposes an h1 on each beat — the focus-move to a fresh h1 is the SR announcement", async () => {
    // With the beat's own h1 (not an aria-live region) as the announcement
    // mechanism, sample the first beat and one advanced beat: both carry an h1.
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Rediscover what you love." })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "How do you feel about this one?" })
    ).toBeInTheDocument();
  });

  it("routes to /collections when 'Leave tutorial' is tapped", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Leave tutorial" }));
    expect(assign).toHaveBeenCalledWith("/collections");
  });

  it("dismisses the walkthrough when 'Leave tutorial' is tapped", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(isWelcomeDismissed()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Leave tutorial" }));
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
      "triageStanding",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        for (let i = 0; i < TRIAGE_ITEMS.length; i++) {
          await user.click(screen.getByText("Love"));
        }
      },
    ],
    [
      "usage",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
      },
    ],
    [
      "usageStanding",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        for (let i = 0; i < USAGE_ITEMS.length; i++) {
          await user.click(screen.getByRole("button", { name: "Yes, I use it" }));
        }
      },
    ],
    [
      "compare",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        await passUsage(user);
      },
    ],
    [
      "standing",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        await passUsage(user);
        await passCompare(user);
      },
    ],
    [
      "refine",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Show me how" }));
        await tapTiers(user);
        await passUsage(user);
        await passCompare(user);
        await user.click(screen.getByRole("button", { name: "Continue" }));
      },
    ],
  ])(
    "the exit action on the %s beat dismisses and routes to /collections",
    async (_beat, advance) => {
      const user = userEvent.setup();
      render(<WalkthroughShell />);
      await advance(user);
      expect(isWelcomeDismissed()).toBe(false);
      await user.click(
        screen.getByRole("button", {
          name: "Leave tutorial",
        }),
      );
      expect(assign).toHaveBeenCalledWith("/collections");
      expect(isWelcomeDismissed()).toBe(true);
    }
  );

  it("dismisses the walkthrough on hand-off completion (explore on my own)", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await tapTiers(user);
    await passUsage(user);
    await passCompare(user);
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

  it("keeps a walkthrough exit on every beat before the hand-off but not on it", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("button", { name: "Leave tutorial" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("button", { name: "Leave tutorial" })).toBeInTheDocument();
    await tapTiers(user);
    // Usage beat — the shell's exact "Leave tutorial" exit is still present (distinct
    // from the usage pass's longer "Skip for now — it'll come around again").
    expect(screen.getByRole("button", { name: "Leave tutorial" })).toBeInTheDocument();
    await passUsage(user);
    await passCompare(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Handoff has its own explore affordance — no "Leave tutorial".
    expect(screen.queryByRole("button", { name: "Leave tutorial" })).not.toBeInTheDocument();
  });
});
