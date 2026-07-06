// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";
import { COMPARE_PAIR, TRIAGE_ITEMS } from "./sampleData";
import { ROUND_COPY } from "@/features/sorting/roundCopy";

// The triage beat now renders the real sorting controls, which call useRouter()
// unconditionally. Local mode never touches the router, but the hook still reads
// the app-router context — stub it so render doesn't throw in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("WelcomePurpose", () => {
  it("renders the Playfair hero and the anti-store framing verbatim", () => {
    render(<WelcomePurpose onNext={() => {}} />);
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Adored isn.?t a store\. It.?s a way to notice which of your things you love most, one gentle choice at a time\./
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show me how" })).toBeInTheDocument();
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
    // Kicker reuses the hub's exact taught noun, composed "A Triage round".
    expect(screen.getByText(`A ${ROUND_COPY.triage.name} round`)).toBeInTheDocument();
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

  it("Not yet reports deferred; Not mine reports setAside — and shows the touch caption", async () => {
    const onOutcome = vi.fn();
    render(<WelcomeTriage index={2} onOutcome={onOutcome} />);
    expect(
      screen.getByText("Not yet keeps it for later. Not mine sets it aside.")
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /not yet/i }));
    expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[2].id, { kind: "deferred" });
    await userEvent.click(screen.getByRole("button", { name: /not mine/i }));
    expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[2].id, { kind: "setAside" });
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
  it("renders the dominant prompt and coach copy verbatim", () => {
    render(<WelcomeCompare onChoose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Which do you love more?" })).toBeInTheDocument();
    expect(
      screen.getByText("When two feel close, this shows which you love more.")
    ).toBeInTheDocument();
  });

  it("offers both of the person's own things and records the pick", async () => {
    const onChoose = vi.fn();
    render(<WelcomeCompare onChoose={onChoose} />);
    const [left, right] = COMPARE_PAIR;
    expect(screen.getByText(left.name)).toBeInTheDocument();
    expect(screen.getByText(right.name)).toBeInTheDocument();
    await userEvent.click(screen.getByText(right.name));
    expect(onChoose).toHaveBeenCalledWith(right.id);
  });
});

describe("WelcomeStanding", () => {
  it("renders the 'what you love most' reframe verbatim", () => {
    render(
      <WelcomeStanding compareWinnerId={COMPARE_PAIR[0].id} triageChoices={{}} onNext={() => {}} />
    );
    expect(screen.getByRole("heading", { name: "What you love most" })).toBeInTheDocument();
    expect(
      screen.getByText(/Adored showed you what you love most .* from things you own\./)
    ).toBeInTheDocument();
  });

  it("crowns the compare winner as the most-loved hero", () => {
    const winner = COMPARE_PAIR[1];
    render(<WelcomeStanding compareWinnerId={winner.id} triageChoices={{}} onNext={() => {}} />);
    // Hero name appears once in the display heading position.
    expect(screen.getAllByText(winner.name).length).toBeGreaterThan(0);
  });
});

describe("WelcomeHandoff", () => {
  it("renders the hand-off copy and links to the real new-collection flow", () => {
    render(<WelcomeHandoff onExplore={() => {}} />);
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
    expect(
      screen.getByText("Start with a few photos of your things.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sort whenever you like — in short rounds, pausing any time.")
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
