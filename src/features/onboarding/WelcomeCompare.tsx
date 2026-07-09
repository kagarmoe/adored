"use client";

import { CompareChoice } from "@/features/sorting/CompareChoice";
import { COMPARE_SUBLINE, ROUND_COPY, WELCOME_ROUND_KICKER } from "@/features/sorting/roundCopy";
import { COMPARE_PAIR, toItem, type CompareOutcome } from "./sampleData";

interface WelcomeCompareProps {
  /** Reports the typed compare outcome, then advances the walkthrough. */
  onOutcome: (outcome: CompareOutcome) => void;
}

// Beat 3 — two of YOUR things side by side, taught with the REAL CompareChoice
// in its synchronous local mode: no fetch, no router, no posthog. The kicker
// uses a NEUTRAL round noun (WELCOME_ROUND_KICKER) distinct from the person-side
// arc names in ROUND_COPY (user decision); the explainer still comes from ROUND_COPY —
// never two product cards to buy.
export function WelcomeCompare({ onOutcome }: WelcomeCompareProps) {
  const [left, right] = COMPARE_PAIR;

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-ink-soft">{WELCOME_ROUND_KICKER}</p>
        <p className="text-sm text-ink-soft">{ROUND_COPY.compare.explainer}</p>
      </div>

      <h1 className="font-display text-3xl text-ink">Which do you love more?</h1>

      <p className="text-sm text-ink-soft">{COMPARE_SUBLINE}</p>

      <div className="w-full max-w-xl">
        <CompareChoice
          submit={{
            kind: "local",
            onDecision: (result) =>
              onOutcome(
                result === "item_a"
                  ? { kind: "win", winnerId: left.id }
                  : result === "item_b"
                    ? { kind: "win", winnerId: right.id }
                    : { kind: result },
              ),
          }}
          itemA={toItem(left)}
          itemB={toItem(right)}
          heroA={left.imageSrc}
          heroB={right.imageSrc}
          comparisonsMade={0}
        />
      </div>
    </section>
  );
}
