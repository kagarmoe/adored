// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeRefine } from "./WelcomeRefine";
import { WelcomeHandoff } from "./WelcomeHandoff";
import { COMPARE_PAIR, type CompareOutcome } from "./sampleData";
import { WELCOME_ROUND_KICKER } from "@/features/sorting/roundCopy";

const SAMPLE_WIN: CompareOutcome = { kind: "win", winnerId: COMPARE_PAIR[0].id };

// The triage beat renders the real sorting controls, which call useRouter()
// unconditionally. Local mode never touches the router, but the hook still reads
// the app-router context — stub it so render doesn't throw in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Render every beat and collect its visible text into one blob.
function allBeatText(): string {
  const parts: string[] = [];
  for (const el of [
    render(<WelcomePurpose onNext={() => {}} />).container,
    render(<WelcomeTriage index={0} onOutcome={() => {}} />).container,
    render(<WelcomeCompare onOutcome={() => {}} />).container,
    render(
      <WelcomeStanding compare={SAMPLE_WIN} triage={{}} onNext={() => {}} />
    ).container,
    render(<WelcomeRefine onNext={() => {}} />).container,
    render(<WelcomeHandoff onExplore={() => {}} />).container,
  ]) {
    parts.push(el.textContent ?? "");
  }
  return parts.join(" \n ");
}

describe("copy guard", () => {
  it("the purpose screen contains the 'isn't a store' contrast", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    // Apostrophe may be a curly ’ — match either.
    expect(container.textContent).toMatch(/isn.?t a store/);
  });

  it("uses no marketplace / price / buy / cart / shop language anywhere", () => {
    const text = allBeatText().toLowerCase();
    const forbidden = [
      "marketplace",
      "price",
      "buy",
      "purchase",
      "cart",
      "shop",
      "store", // allowed ONLY inside "isn't a store"; checked separately below
      "checkout",
      "sale",
      "deal",
      "brand",
    ];
    for (const word of forbidden) {
      if (word === "store") continue; // handled below
      expect(text, `forbidden word "${word}" appeared in beat copy`).not.toContain(word);
    }
    // "store" may appear only in the anti-marketplace contrast.
    const storeHits = text.match(/store/g) ?? [];
    expect(storeHits.length).toBe(1);
    expect(text).toContain("isn");
  });
});

describe("purpose journey line", () => {
  it("renders the quiet three-phrase journey", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Gather a few photos of your things.");
    expect(text).toContain("Sort in short rounds.");
    expect(text).toContain("See where things stand.");
  });

  it("renders the journey as quiet text-ink-soft paragraphs with no icons/arrows", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    // Each journey phrase lives in a text-ink-soft <p>; the stack carries no svg/icon.
    for (const phrase of [
      "Gather a few photos of your things.",
      "Sort in short rounds.",
      "See where things stand.",
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
    expect(text).toContain("Put things in order");
    expect(text).toContain("starts another round whenever you want it truer");
    expect(text).toContain("When it feels complete, you can finalize it and share it.");
  });
});

describe("triage + compare teaching copy", () => {
  it("triage carries the shared kicker, explainer, and escape caption", () => {
    const { container } = render(<WelcomeTriage index={0} onOutcome={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain(WELCOME_ROUND_KICKER);
    expect(text).toContain("One at a time — how do you feel about each?");
    expect(text).toContain("Not yet keeps it for later. Not mine sets it aside.");
  });

  it("compare carries the shared kicker, explainer, and subline", () => {
    const { container } = render(<WelcomeCompare onOutcome={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain(WELCOME_ROUND_KICKER);
    expect(text).toContain("Two side by side — which do you love more?");
    expect(text).toContain("Tap the one you love more. Tie or skip whenever you like.");
  });
});

describe("handoff expectation lines", () => {
  it("sets the photos + short-rounds expectations verbatim", () => {
    const { container } = render(<WelcomeHandoff onExplore={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Start with a few photos of your things.");
    expect(text).toContain(
      "Sort whenever you like — in short rounds, pausing any time."
    );
  });
});

describe("a11y: touch targets >= 44px", () => {
  it("every interactive control carries an h-11 / h-14 / min-h-11 sizing class", () => {
    const controls: HTMLElement[] = [];
    for (const c of [
      render(<WelcomePurpose onNext={() => {}} />).container,
      render(<WelcomeTriage index={0} onOutcome={() => {}} />).container,
      render(<WelcomeCompare onOutcome={() => {}} />).container,
      render(
        <WelcomeStanding compare={SAMPLE_WIN} triage={{}} onNext={() => {}} />
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
      render(<WelcomeStanding compare={SAMPLE_WIN} triage={{}} onNext={() => {}} />)
        .container,
    ]) {
      const section = c.querySelector("section");
      expect(section?.className ?? "").not.toMatch(/\b(transition|animate)-/);
    }
  });
});
