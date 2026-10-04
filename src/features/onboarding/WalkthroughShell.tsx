"use client";

import { useEffect, useRef, useState } from "react";
import { dismissWelcome } from "./dismissal";
import {
  buildTriageStanding,
  comparePairsFor,
  TRIAGE_ITEMS,
  type CompareOutcome,
  type CompareRoundResult,
  type TriageOutcome,
} from "./sampleData";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";

type Beat = "purpose" | "feelings" | "pairs" | "standing" | "handoff";

// The walkthrough is client-only state (decision 25): a beat cursor plus the typed
// outcomes the person taps. It teaches the real sort's two phases (spec §4):
// feelings for every piece, then pairs over Love + Like, then the ranking.
export function WalkthroughShell() {
  const [beat, setBeat] = useState<Beat>("purpose");
  const [triageIndex, setTriageIndex] = useState(0);
  const [triageOutcomes, setTriageOutcomes] = useState<Record<string, TriageOutcome>>({});
  const [compareIndex, setCompareIndex] = useState(0);
  const [compareResults, setCompareResults] = useState<CompareRoundResult[]>([]);

  // Focus the beat wrapper on every advance so a screen reader re-announces the beat.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapperRef.current?.focus();
  }, [beat, triageIndex, compareIndex]);

  const goTo = (next: Beat) => {
    if (next === "handoff") dismissWelcome();
    setBeat(next);
  };

  const comparePairs = comparePairsFor(buildTriageStanding(triageOutcomes));
  const currentPair = comparePairs[compareIndex] ?? null;

  const handleTriageOutcome = (itemId: string, outcome: TriageOutcome) => {
    const next = { ...triageOutcomes, [itemId]: outcome };
    setTriageOutcomes(next);
    if (triageIndex + 1 < TRIAGE_ITEMS.length) {
      setTriageIndex((i) => i + 1);
      return;
    }
    // Every piece has passed through: pairs if two are loved, else straight to the ranking.
    goTo(comparePairsFor(buildTriageStanding(next)).length > 0 ? "pairs" : "standing");
  };

  const handleCompareOutcome = (outcome: CompareOutcome) => {
    if (!currentPair) {
      goTo("standing");
      return;
    }
    const [left, right] = currentPair;
    setCompareResults((prev) => [...prev, { itemAId: left.id, itemBId: right.id, outcome }]);
    if (compareIndex + 1 < comparePairs.length) {
      setCompareIndex((i) => i + 1);
    } else {
      goTo("standing");
    }
  };

  const exit = () => {
    dismissWelcome();
    // Full-document nav, NOT router.push: the server must re-run the /collections →
    // /welcome gate with the fresh dismissal cookie (purses-etv0).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full navigation so the server re-runs the /welcome gate (purses-etv0)
    window.location.assign("/collections");
  };

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
      <div ref={wrapperRef} tabIndex={-1} className="w-full max-w-md focus:outline-hidden sm:max-w-2xl">
        {beat === "purpose" && <WelcomePurpose onNext={() => goTo("feelings")} />}
        {beat === "feelings" && <WelcomeTriage index={triageIndex} onOutcome={handleTriageOutcome} />}
        {beat === "pairs" && currentPair && (
          <WelcomeCompare left={currentPair[0]} right={currentPair[1]} onOutcome={handleCompareOutcome} />
        )}
        {beat === "standing" && (
          <WelcomeStanding comparisons={compareResults} triage={triageOutcomes} onNext={() => goTo("handoff")} />
        )}
        {beat === "handoff" && <WelcomeHandoff onExplore={exit} />}
      </div>

      {/* Quiet, persistent escape on every beat but the last. */}
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
