// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierBadge } from "./TierBadge";

const TIERS = [
  { tier: "love", glyph: "●", label: "Love" },
  { tier: "like", glyph: "◕", label: "Like" },
  { tier: "maybe", glyph: "◑", label: "Maybe" },
  { tier: "onward", glyph: "○", label: "Onward" },
] as const;

describe("TierBadge", () => {
  for (const { tier, glyph, label } of TIERS) {
    it(`renders the ${tier} glyph and label`, () => {
      const { container } = render(<TierBadge tier={tier} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.textContent).toContain(glyph);
    });
  }

  it("keeps an accessible name when showLabel is false (the glyph alone is aria-hidden)", () => {
    const { container } = render(<TierBadge tier="love" showLabel={false} />);
    expect(screen.getByRole("img", { name: "Love" })).toBeInTheDocument();
    expect(screen.queryByText("Love")).not.toBeInTheDocument(); // no visible label (TONE)
    expect(container.textContent).toContain("●");
  });

  it("marks the glyph aria-hidden so it isn't announced twice", () => {
    const { container } = render(<TierBadge tier="maybe" />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveTextContent("◑");
  });
});
