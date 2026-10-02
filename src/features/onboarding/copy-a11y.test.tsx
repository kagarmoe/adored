// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";
import { COMPARE_PAIR, type CompareOutcome, type CompareRoundResult } from "./sampleData";

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
  it("renders the two-step journey as quiet text-ink-soft paragraphs with no icons", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    for (const phrase of [
      "First, how you feel about each piece.",
      "Then, two at a time, which you’d reach for first.",
      "At the end, you’ll see what you love most.",
    ]) {
      const p = Array.from(container.querySelectorAll("p")).find((el) => el.textContent?.trim() === phrase);
      expect(p, `journey phrase "${phrase}" not found in its own <p>`).toBeTruthy();
      expect(p?.className ?? "").toMatch(/\btext-ink-soft\b/);
    }
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("a11y: touch targets >= 44px", () => {
  it("every interactive control carries an h-11 / h-14 / min-h-11 sizing class", () => {
    const controls: HTMLElement[] = [];
    for (const c of [
      render(<WelcomePurpose onNext={() => {}} />).container,
      render(<WelcomeTriage index={0} onOutcome={() => {}} />).container,
      render(<WelcomeCompare left={COMPARE_PAIR[0]} right={COMPARE_PAIR[1]} onOutcome={() => {}} />)
        .container,
      render(
        <WelcomeStanding comparisons={[SAMPLE_COMPARISON]} triage={{}} onNext={() => {}} />
      ).container,
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
