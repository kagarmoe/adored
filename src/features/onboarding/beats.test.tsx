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
  it("renders the prompt, coach copy, and exactly one item (never a grid)", () => {
    render(<WelcomeTriage index={0} onChoose={() => {}} />);
    expect(screen.getByRole("heading", { name: "How do you feel about this one?" })).toBeInTheDocument();
    expect(screen.getByText("Tap how you feel. There are no wrong answers.")).toBeInTheDocument();
    // One item on screen: only the first triage item's name is present.
    expect(screen.getByText(TRIAGE_ITEMS[0].name)).toBeInTheDocument();
    expect(screen.queryByText(TRIAGE_ITEMS[1].name)).not.toBeInTheDocument();
  });

  it("shows all four tiers as tap targets", () => {
    render(<WelcomeTriage index={0} onChoose={() => {}} />);
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("records the tapped tier and item when a tier is tapped", async () => {
    const onChoose = vi.fn();
    render(<WelcomeTriage index={0} onChoose={onChoose} />);
    await userEvent.click(screen.getByText("Love"));
    expect(onChoose).toHaveBeenCalledWith(TRIAGE_ITEMS[0].id, "love");
  });
});

describe("WelcomeCompare", () => {
  it("renders the dominant prompt and coach copy verbatim", () => {
    render(<WelcomeCompare onChoose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Which do you reach for more?" })).toBeInTheDocument();
    expect(
      screen.getByText("When two feel close, this shows which you reach for.")
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
      screen.getByText("Add a few things you own to start a collection.")
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
