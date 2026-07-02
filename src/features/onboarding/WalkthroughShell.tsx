"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dismissWelcome } from "./dismissal";
import { TRIAGE_ITEMS, type Tier } from "./sampleData";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";

type Beat = "purpose" | "triage" | "compare" | "standing" | "handoff";

const BEAT_ORDER: Beat[] = ["purpose", "triage", "compare", "standing", "handoff"];

// The walkthrough is client-only state: a step cursor plus the choices the
// person taps. No API, no DB — the Standing beat reads these choices back.
export function WalkthroughShell() {
  const router = useRouter();
  const [beat, setBeat] = useState<Beat>("purpose");
  const [triageIndex, setTriageIndex] = useState(0);
  const [triageChoices, setTriageChoices] = useState<Record<string, Tier>>({});
  const [compareWinnerId, setCompareWinnerId] = useState<string>("");

  const goTo = (next: Beat) => {
    // Reaching the hand-off = the walkthrough was completed. Remember it so the
    // auto-trigger doesn't re-arm on the next zero-collection login. (Skip sets
    // it too, below.)
    if (next === "handoff") dismissWelcome();
    setBeat(next);
  };

  const handleTriageChoice = (itemId: string, tier: Tier) => {
    setTriageChoices((prev) => ({ ...prev, [itemId]: tier }));
    if (triageIndex + 1 < TRIAGE_ITEMS.length) {
      setTriageIndex((i) => i + 1);
    } else {
      goTo("compare");
    }
  };

  const handleCompareChoice = (winnerId: string) => {
    setCompareWinnerId(winnerId);
    goTo("standing");
  };

  const exit = () => {
    dismissWelcome();
    router.push("/collections");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-6 py-12">
      <div className="w-full max-w-2xl">
        {beat === "purpose" && <WelcomePurpose onNext={() => goTo("triage")} />}
        {beat === "triage" && (
          <WelcomeTriage index={triageIndex} onChoose={handleTriageChoice} />
        )}
        {beat === "compare" && <WelcomeCompare onChoose={handleCompareChoice} />}
        {beat === "standing" && (
          <WelcomeStanding
            compareWinnerId={compareWinnerId}
            triageChoices={triageChoices}
            onNext={() => goTo("handoff")}
          />
        )}
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

export { BEAT_ORDER };
