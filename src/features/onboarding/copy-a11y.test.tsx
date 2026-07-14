// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeUsage } from "./WelcomeUsage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeRefine } from "./WelcomeRefine";
import { WelcomeHandoff } from "./WelcomeHandoff";
import { COMPARE_PAIR, TRIAGE_ITEMS, type CompareOutcome, type CompareRoundResult } from "./sampleData";

const SAMPLE_WIN: CompareOutcome = { kind: "win", winnerId: COMPARE_PAIR[0].id };
const SAMPLE_COMPARISON: CompareRoundResult = {
  itemAId: COMPARE_PAIR[0].id,
  itemBId: COMPARE_PAIR[1].id,
  outcome: SAMPLE_WIN,
};

// The triage beat renders the real sorting controls, which call useRouter()
// unconditionally. Local mode never touches the router, but the hook still reads
// the app-router context — stub it so render doesn't throw in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("purpose journey line", () => {
  it("renders the quiet sample sorting journey", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("In this tutorial, you’ll sort a small sample collection through three short rounds.");
    expect(text).toContain("Triage groups by how you feel.");
    expect(text).toContain("Usage asks what happens in your life.");
    expect(text).toContain("Compare puts pieces in order.");
    expect(text).toContain("After each round, you’ll see what changed and what you adore.");
    expect(text).not.toContain("Add photos to a collection.");
    expect(text).not.toContain("Make items when you’re ready.");
  });

  it("renders the journey as quiet text-ink-soft paragraphs with no icons/arrows", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    // Each journey phrase lives in a text-ink-soft <p>; the stack carries no svg/icon.
    for (const phrase of [
      "Triage groups by how you feel.",
      "Usage asks what happens in your life.",
      "Compare puts pieces in order.",
      "After each round, you’ll see what changed and what you adore.",
    ]) {
      const p = Array.from(container.querySelectorAll("p")).find(
        (el) => el.textContent?.trim() === phrase
      );
      expect(p, `journey phrase "${phrase}" not found in its own <p>`).toBeTruthy();
      expect(p?.className ?? "").toMatch(/\btext-ink-soft\b/);
    }
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("refine beat copy", () => {
  it("names the living standing and the finalize/share step verbatim", () => {
    const { container } = render(<WelcomeRefine onNext={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Refine it any time");
    expect(text).toContain("The standing keeps updating as you sort");
    // Names the REAL button people meet, so the surfaces cannot fork.
    expect(text).toContain("Adjust results");
    expect(text).toContain("lets you drag the list until it feels right");
    expect(text).toContain("When it feels complete, you can finalize it and share it.");
  });
});

describe("a11y: touch targets >= 44px", () => {
  it("every interactive control carries an h-11 / h-14 / min-h-11 sizing class", () => {
    const controls: HTMLElement[] = [];
    for (const c of [
      render(<WelcomePurpose onNext={() => {}} />).container,
      render(<WelcomeTriage index={0} onOutcome={() => {}} />).container,
      render(<WelcomeUsage item={TRIAGE_ITEMS[0]} onOutcome={() => {}} />).container,
      render(<WelcomeCompare left={COMPARE_PAIR[0]} right={COMPARE_PAIR[1]} onOutcome={() => {}} />)
        .container,
      render(
        <WelcomeStanding comparisons={[SAMPLE_COMPARISON]} triage={{}} onNext={() => {}} />
      ).container,
      render(<WelcomeRefine onNext={() => {}} />).container,
      render(<WelcomeHandoff onExplore={() => {}} />).container,
    ]) {
      controls.push(...Array.from(c.querySelectorAll<HTMLElement>("button, a")));
    }
    expect(controls.length).toBeGreaterThan(0);
    for (const el of controls) {
      const cls = el.className;
      const ok = /\bh-11\b/.test(cls) || /\bh-14\b/.test(cls) || /\bmin-h-11\b/.test(cls);
      expect(ok, `control "${el.textContent?.trim()}" lacks a >=44px height class: ${cls}`).toBe(
        true
      );
    }
  });
});

describe("a11y: no essential motion", () => {
  it("beat containers declare no transition/animation on their root", () => {
    // Reduced-motion users must get a static experience: the walkthrough's
    // advancement is state-swap, not an animated transition. Assert no beat
    // root element opts into transition/animate utilities.
    for (const c of [
      render(<WelcomePurpose onNext={() => {}} />).container,
      render(<WelcomeStanding comparisons={[SAMPLE_COMPARISON]} triage={{}} onNext={() => {}} />)
        .container,
    ]) {
      const section = c.querySelector("section");
      expect(section?.className ?? "").not.toMatch(/\b(transition|animate)-/);
    }
  });
});
