// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";
import {
  COMPARE_PAIR,
  TRIAGE_ITEMS,
  type CompareOutcome,
  type CompareRoundResult,
  type TriageOutcome,
} from "./sampleData";
import {
  COMPARE_SUBLINE,
  ROUND_COPY,
  WELCOME_ROUND_KICKER,
} from "@/features/sorting/roundCopy";

// The triage beat now renders the real sorting controls, which call useRouter()
// unconditionally. Local mode never touches the router, but the hook still reads
// the app-router context — stub it so render doesn't throw in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("WelcomePurpose", () => {
  it("frames the walkthrough as two steps, not rounds", () => {
    render(<WelcomePurpose onNext={() => {}} />);
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    expect(screen.getByText("In this tutorial, you’ll sort a small sample collection in two steps.")).toBeInTheDocument();
    expect(screen.getByText("First, how you feel about each piece.")).toBeInTheDocument();
    expect(screen.getByText("Then, two at a time, which you’d reach for first.")).toBeInTheDocument();
    expect(screen.getByText("At the end, you’ll see what you love most.")).toBeInTheDocument();
    expect(screen.queryByText(/round/i)).not.toBeInTheDocument();
  });

  it("advances when 'Show me how' is tapped", async () => {
    const onNext = vi.fn();
    render(<WelcomePurpose onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Show me how" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("WelcomeTriage", () => {
  it("renders the kicker + shared explainer and NOT the old reassurance line", () => {
    render(<WelcomeTriage index={0} onOutcome={vi.fn()} />);
    // Kicker is a neutral round noun distinct from the person-side arc names (user decision).
    expect(screen.getByText(WELCOME_ROUND_KICKER)).toBeInTheDocument();
    expect(screen.getByText(ROUND_COPY.triage.explainer)).toBeInTheDocument();
    // The old hand-rolled reassurance line is gone.
    expect(screen.queryByText(/no wrong answers/i)).not.toBeInTheDocument();
  });

  it("tier tap reports a tier outcome", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeTriage index={0} onOutcome={onOutcome} />);
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[0].id, { kind: "tier", tier: "love" });
  });

  it("Not yet reports deferred; Not mine reports setAside — with hover copy on the buttons", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeTriage index={2} onOutcome={onOutcome} />);
    expect(
      screen.queryByText("Not yet keeps it for later. Not mine sets it aside.")
    ).not.toBeInTheDocument();
    const defer = screen.getByRole("button", { name: /not yet/i });
    const setAside = screen.getByRole("button", { name: /not mine/i });
    expect(defer).toHaveAttribute("title", "Keeps it for later");
    expect(setAside).toHaveAttribute("title", "Sets it aside");
    await userEvent.click(defer);
    expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[2].id, { kind: "deferred" });
    await userEvent.click(setAside);
    expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[2].id, { kind: "setAside" });
  });

  it("keeps Not yet and Not mine together as item-specific escape actions", () => {
    render(<WelcomeTriage index={0} onOutcome={vi.fn()} />);
    const defer = screen.getByRole("button", { name: /not yet/i });
    const setAside = screen.getByRole("button", { name: /not mine/i });
    const row = defer.parentElement;
    expect(row).toHaveClass("flex-nowrap");
    expect(row).toContainElement(defer);
    expect(row).toContainElement(setAside);
    expect(screen.queryByRole("button", { name: "Leave tutorial" })).not.toBeInTheDocument();
  });

  it("never fetches across a full item's taps (local mode is synchronous)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      render(<WelcomeTriage index={0} onOutcome={vi.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: "Love" }));
      await userEvent.click(screen.getByRole("button", { name: /not yet/i }));
      await userEvent.click(screen.getByRole("button", { name: /not mine/i }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("WelcomeCompare", () => {
  const [left, right] = COMPARE_PAIR;

  it("renders the kicker + shared explainer, the dominant prompt, and the compare sub-line", () => {
    render(<WelcomeCompare left={left} right={right} onOutcome={vi.fn()} />);
    // Kicker is a neutral round noun distinct from the person-side arc names (user decision).
    expect(screen.getByText(WELCOME_ROUND_KICKER)).toBeInTheDocument();
    expect(screen.getByText(ROUND_COPY.compare.explainer)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which would you reach for first?" })).toBeInTheDocument();
    expect(screen.getByText(COMPARE_SUBLINE)).toBeInTheDocument();
    expect(screen.queryByText(/Pair 1 of/i)).not.toBeInTheDocument();
  });

  it("tapping the left card reports a win for the left item", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeCompare left={left} right={right} onOutcome={onOutcome} />);
    await userEvent.click(screen.getByRole("button", { name: `Choose ${left.name}` }));
    expect(onOutcome).toHaveBeenCalledWith({ kind: "win", winnerId: left.id });
  });

  it("Tie reports a tie outcome", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeCompare left={left} right={right} onOutcome={onOutcome} />);
    await userEvent.click(screen.getByRole("button", { name: "Tie" }));
    expect(onOutcome).toHaveBeenCalledWith({ kind: "tie" });
  });

  it("Skip reports a skip outcome", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeCompare left={left} right={right} onOutcome={onOutcome} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onOutcome).toHaveBeenCalledWith({ kind: "skip" });
  });

  it("never fetches across taps (local mode is synchronous)", async () => {
      const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const onOutcome = vi.fn();
      render(<WelcomeCompare left={left} right={right} onOutcome={onOutcome} />);
      await userEvent.click(screen.getByRole("button", { name: `Choose ${left.name}` }));
      await userEvent.click(screen.getByRole("button", { name: "Tie" }));
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(fetchSpy).not.toHaveBeenCalled();
      // Non-vacuous: the taps really landed on the local handler.
      expect(onOutcome).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("WelcomeStanding", () => {
  const win: CompareOutcome = { kind: "win", winnerId: COMPARE_PAIR[0].id };
  const winRound: CompareRoundResult = {
    itemAId: COMPARE_PAIR[0].id,
    itemBId: COMPARE_PAIR[1].id,
    outcome: win,
  };

  it("titles the beat 'Your ranking so far' with the hero labeled 'What you love most'", () => {
    render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
    // The winner leads as the hero, under the "What you love most" eyebrow.
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    const region = screen.getByRole("region", { name: /your ranking so far/i });
    expect(within(region).getByText(COMPARE_PAIR[0].name)).toBeInTheDocument();
  });

  it("renders the affirmation as the LAST content element in the region", () => {
    const triage: Record<string, TriageOutcome> = {
      [TRIAGE_ITEMS[0].id]: { kind: "tier", tier: "love" },
      [TRIAGE_ITEMS[1].id]: { kind: "setAside" },
      [TRIAGE_ITEMS[2].id]: { kind: "deferred" },
    };
    render(<WelcomeStanding comparisons={[winRound]} triage={triage} onNext={vi.fn()} />);
    const section = screen.getByRole("region", { name: /your ranking so far/i });
    const paras = within(section).getAllByText(/./, { selector: "p, h1, h3, li" });
    expect(paras[paras.length - 1]).toHaveTextContent("What you love most is at the top.");
  });

  it("highlights the compare-driven order change", () => {
    render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={vi.fn()} />);
    expect(screen.getByText("Your pair choices put the ones you love most in order.")).toBeInTheDocument();
    expect(screen.queryByText(/Usage/)).not.toBeInTheDocument();
  });

  it("shows 'Where these go next' for onward-tier items, and omits it when none", () => {
    const withOnward: Record<string, TriageOutcome> = {
      [TRIAGE_ITEMS[2].id]: { kind: "tier", tier: "onward" },
    };
    const { unmount } = render(
      <WelcomeStanding comparisons={[winRound]} triage={withOnward} onNext={vi.fn()} />
    );
    expect(screen.getByText("Where these go next")).toBeInTheDocument();
    // The onward group carries the real results page's softening line, byte-for-byte.
    expect(
      screen.getByText("These are ready to move on — to a new home, or simply on from here.")
    ).toBeInTheDocument();
    unmount();
    // No onward tiers → every ranked row is loved; the onward section is absent.
    render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={vi.fn()} />);
    expect(screen.queryByText("Where these go next")).not.toBeInTheDocument();
  });

  it("shows the set-aside row only after a Not-mine (setAside)", () => {
    const { unmount } = render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={vi.fn()} />);
    expect(
      screen.queryByText("Set aside — waiting, whenever you want them")
    ).not.toBeInTheDocument();
    unmount();
    render(
      <WelcomeStanding
        comparisons={[winRound]}
        triage={{ [TRIAGE_ITEMS[0].id]: { kind: "setAside" } }}
        onNext={vi.fn()}
      />
    );
    expect(
      screen.getByText("Set aside — waiting, whenever you want them")
    ).toBeInTheDocument();
  });

  it("shows the 'Still deciding' row only after a Not-yet (deferred)", () => {
    const { unmount } = render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={vi.fn()} />);
    expect(screen.queryByText("Still deciding")).not.toBeInTheDocument();
    unmount();
    render(
      <WelcomeStanding
        comparisons={[winRound]}
        triage={{ [TRIAGE_ITEMS[0].id]: { kind: "deferred" } }}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Still deciding")).toBeInTheDocument();
  });

  it("all triage escaped: no hero is forced, both escape rows show", () => {
    const escaped: Record<string, TriageOutcome> = {
      [TRIAGE_ITEMS[0].id]: { kind: "deferred" },
      [TRIAGE_ITEMS[1].id]: { kind: "setAside" },
      [TRIAGE_ITEMS[2].id]: { kind: "deferred" },
    };
    render(<WelcomeStanding comparisons={[winRound]} triage={escaped} onNext={vi.fn()} />);
    const region = screen.getByRole("region", { name: /your ranking so far/i });
    expect(screen.queryByText("What you love most")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing needs to rise yet. The pieces you stepped around are waiting below.")).toBeInTheDocument();
    expect(within(region).getByText(COMPARE_PAIR[0].name)).toBeInTheDocument();
    expect(
      screen.getByText("Set aside — waiting, whenever you want them")
    ).toBeInTheDocument();
    expect(screen.getByText("Still deciding")).toBeInTheDocument();
  });

  it("advances when Continue is tapped", async () => {
    const onNext = vi.fn();
    render(<WelcomeStanding comparisons={[winRound]} triage={{}} onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("WelcomeHandoff", () => {
  it("renders the hand-off copy and links to the real new-collection flow", () => {
    render(<WelcomeHandoff onExplore={() => {}} />);
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
    expect(
      screen.getByText("Begin with photos. They can wait in the pool until you make items.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sort whenever you like, a few pieces at a time.")
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Start a collection" });
    expect(cta).toHaveAttribute("href", "/collections/new");
  });

  it("offers a quiet explore-on-my-own escape", async () => {
    const onExplore = vi.fn();
    render(<WelcomeHandoff onExplore={onExplore} />);
    await userEvent.click(screen.getByText(/I.?ll explore on my own\./));
    expect(onExplore).toHaveBeenCalledOnce();
  });
});
