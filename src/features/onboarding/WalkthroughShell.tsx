"use client";

import { useEffect, useRef, useState } from "react";
import { dismissWelcome } from "./dismissal";
import {
  comparePairsFor,
  buildTriageStanding,
  TRIAGE_ITEMS,
  USAGE_ITEMS,
  type CompareOutcome,
  type CompareRoundResult,
  type SampleItem,
  type TriageOutcome,
  type UsageOutcome,
} from "./sampleData";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeUsage } from "./WelcomeUsage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeRoundStanding } from "./WelcomeRoundStanding";
import { WelcomeRefine } from "./WelcomeRefine";
import { WelcomeHandoff } from "./WelcomeHandoff";

type Beat =
  | "purpose"
  | "triage"
  | "triageStanding"
  | "usage"
  | "usageStanding"
  | "compare"
  | "standing"
  | "refine"
  | "handoff";

// The walkthrough is client-only state: a step cursor plus the typed outcomes the
// person taps. No API, no DB — the Standing beat reads these outcomes back.
export function WalkthroughShell() {
  const [beat, setBeat] = useState<Beat>("purpose");
  const [triageIndex, setTriageIndex] = useState(0);
  const [triageOutcomes, setTriageOutcomes] = useState<Record<string, TriageOutcome>>({});
  const [usageIndex, setUsageIndex] = useState(0);
  const [usageOutcomes, setUsageOutcomes] = useState<Record<string, UsageOutcome>>({});
  const [compareIndex, setCompareIndex] = useState(0);
  const [compareResults, setCompareResults] = useState<CompareRoundResult[]>([]);

  // Focus target: on every advance we move focus to the beat's wrapper (not a
  // labeled control) so a screen reader re-announces the region without stealing
  // a control's focus semantics. Index dependencies cover advances within the
  // same beat.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapperRef.current?.focus();
  }, [beat, triageIndex, usageIndex, compareIndex]);

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
    // never re-queues, so three taps always reach the first standing.
    if (triageIndex + 1 < TRIAGE_ITEMS.length) {
      setTriageIndex((i) => i + 1);
    } else {
      goTo("triageStanding");
    }
  };

  const handleUsageOutcome = (outcome: UsageOutcome) => {
    const item = USAGE_ITEMS[usageIndex];
    setUsageOutcomes((prev) => ({ ...prev, [item.id]: outcome }));
    if (usageIndex + 1 < USAGE_ITEMS.length) {
      setUsageIndex((i) => i + 1);
    } else {
      goTo("usageStanding");
    }
  };

  const standingAfterTriage = buildTriageStanding(triageOutcomes);
  const comparePairs = comparePairsFor(standingAfterTriage);
  const currentComparePair: readonly [SampleItem, SampleItem] | null =
    comparePairs[compareIndex] ?? null;

  const handleCompareOutcome = (outcome: CompareOutcome) => {
    if (!currentComparePair) {
      goTo("standing");
      return;
    }
    const [left, right] = currentComparePair;
    setCompareResults((prev) => [
      ...prev,
      { itemAId: left.id, itemBId: right.id, outcome },
    ]);
    if (compareIndex + 1 < comparePairs.length) {
      setCompareIndex((i) => i + 1);
    } else {
      goTo("standing");
    }
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
    <div className="min-h-[100svh] flex flex-col items-center justify-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
      <div
        ref={wrapperRef}
        tabIndex={-1}
        className="w-full max-w-md focus:outline-hidden sm:max-w-2xl"
      >
        {beat === "purpose" && <WelcomePurpose onNext={() => goTo("triage")} />}
        {beat === "triage" && (
          <WelcomeTriage index={triageIndex} onOutcome={handleTriageOutcome} />
        )}
        {beat === "triageStanding" && (
          <WelcomeRoundStanding
            stage="triage"
            triage={triageOutcomes}
            onNext={() => goTo("usage")}
          />
        )}
        {beat === "usage" && (
          <WelcomeUsage item={USAGE_ITEMS[usageIndex]} onOutcome={handleUsageOutcome} />
        )}
        {beat === "usageStanding" && (
          <WelcomeRoundStanding
            stage="usage"
            triage={triageOutcomes}
            usageByItemId={usageOutcomes}
            onNext={() => goTo(currentComparePair ? "compare" : "standing")}
          />
        )}
        {beat === "compare" && currentComparePair && (
          <WelcomeCompare
            left={currentComparePair[0]}
            right={currentComparePair[1]}
            onOutcome={handleCompareOutcome}
          />
        )}
        {beat === "standing" && (
          <WelcomeStanding
            comparisons={compareResults}
            triage={triageOutcomes}
            usageByItemId={usageOutcomes}
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
          className="h-11 w-full max-w-xs rounded-control px-4 text-sm text-ink-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary sm:w-auto"
        >
          Leave tutorial
        </button>
      )}
    </div>
  );
}
