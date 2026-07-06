"use client";

import { useEffect, useRef, useState } from "react";
import { dismissWelcome } from "./dismissal";
import { TRIAGE_ITEMS, type CompareOutcome, type TriageOutcome } from "./sampleData";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeRefine } from "./WelcomeRefine";
import { WelcomeHandoff } from "./WelcomeHandoff";

type Beat = "purpose" | "triage" | "compare" | "standing" | "refine" | "handoff";

// The walkthrough is client-only state: a step cursor plus the typed outcomes the
// person taps. No API, no DB — the Standing beat reads these outcomes back.
export function WalkthroughShell() {
  const [beat, setBeat] = useState<Beat>("purpose");
  const [triageIndex, setTriageIndex] = useState(0);
  const [triageOutcomes, setTriageOutcomes] = useState<Record<string, TriageOutcome>>({});
  const [compareOutcome, setCompareOutcome] = useState<CompareOutcome | null>(null);

  // Focus target: on every advance we move focus to the beat's wrapper (not a
  // labeled control) so a screen reader re-announces the region without stealing
  // a control's focus semantics. Keyed on [beat, triageIndex] so a triage tier
  // tap (which advances the index within the triage beat) re-focuses too.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapperRef.current?.focus();
  }, [beat, triageIndex]);

  const goTo = (next: Beat) => {
    // Reaching the hand-off = the walkthrough was completed. Remember it so the
    // auto-trigger doesn't re-arm on the next zero-collection login. (Skip sets
    // it too, below.)
    if (next === "handoff") dismissWelcome();
    setBeat(next);
  };

  const handleTriageOutcome = (itemId: string, outcome: TriageOutcome) => {
    setTriageOutcomes((prev) => ({ ...prev, [itemId]: outcome }));
    // Every outcome — tier, defer, or set-aside — advances by index. The demo
    // never re-queues, so three taps always reach compare.
    if (triageIndex + 1 < TRIAGE_ITEMS.length) {
      setTriageIndex((i) => i + 1);
    } else {
      goTo("compare");
    }
  };

  const handleCompareOutcome = (outcome: CompareOutcome) => {
    setCompareOutcome(outcome);
    goTo("standing");
  };

  const exit = () => {
    dismissWelcome();
    // ponytail: full-document nav, NOT router.push — leaving the onboarding SPA
    // for the real app must let the SERVER re-run the /collections→/welcome gate
    // with the freshly-set dismissal cookie. router.push replays a poisoned
    // App Router cache entry and bounces back to /welcome (purses-etv0).
    window.location.assign("/collections");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-6 py-12">
      <div
        ref={wrapperRef}
        tabIndex={-1}
        className="w-full max-w-2xl focus:outline-none"
      >
        {beat === "purpose" && <WelcomePurpose onNext={() => goTo("triage")} />}
        {beat === "triage" && (
          <WelcomeTriage index={triageIndex} onOutcome={handleTriageOutcome} />
        )}
        {beat === "compare" && <WelcomeCompare onOutcome={handleCompareOutcome} />}
        {/* ponytail: standing is only reachable after a compare tap, so
            compareOutcome is non-null here; the ?? "skip" fallback keeps the type
            honest without an assertion. */}
        {beat === "standing" && (
          <WelcomeStanding
            compare={compareOutcome ?? { kind: "skip" }}
            triage={triageOutcomes}
            onNext={() => goTo("refine")}
          />
        )}
        {beat === "refine" && <WelcomeRefine onNext={() => goTo("handoff")} />}
        {beat === "handoff" && <WelcomeHandoff onExplore={exit} />}
      </div>

      {/* Quiet, persistent escape — present on every beat but the last, which
          has its own explore affordance. */}
      {beat !== "handoff" && (
        <button
          type="button"
          onClick={exit}
          className="h-11 px-4 text-sm text-ink-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-control"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
